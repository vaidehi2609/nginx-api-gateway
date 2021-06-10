# nginx-api-gateway
# Implementation

So the folder structure of this mini-project, will end up looking something like this:

./auth/                   # Our service for authorization
./coffee/                # Our service for delivering coffee
./tea/                     # Our service for delivering tea
./nginx/                 # Files for configuration of our NGINX instance
./docker-compose.yml

With our docker-compose file consisting of four services:

- The NGINX gateway/proxy
- The Coffee & Tea dummy services
- The Authorisation dummy service

## Creating tea and coffee services

So, first, we are going to create two, more or less, identical services: The Coffee and Tea services, which will simply return a response of either Coffe or Tea being served, whenever a request is sent

`tea/index.js`

```jsx
const express = require('express')
const app = express()
const os = require('os');
const port = process.env.PORT || 8080

app.get('/tea', (req, res) => {
    try {
        res.send(`<h3>Your tea has been served by ${os.hostname()}</h3>`);
    } catch (error) {
        console.log(error)
    }
    
})
app.listen(port, () => {
    console.log(`Server Started on Port  ${port}`)
})
```

Similarly we can implement our almost identical coffee service:

`coffee/index.js`

```jsx
const express = require('express')
const app = express()
const os = require('os');
const port = process.env.PORT || 8080

app.get('/coffee', (req, res) => {
    try {
        res.send(`<h3>Your coffee has been served by ${os.hostname()}</h3>`);
    } catch (error) {
        console.log(error)
    }
    
})
app.listen(port, () => {
    console.log(`Server Started on Port  ${port}`)
})
```

Next step is to create a simple docker file for our tea and coffee services:

`tea/dockerfile` &  `coffee/dockerfile`

```jsx
FROM node
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
CMD npm start
EXPOSE 8080
```

Both literally have the same configuration .This completes our two small services

## Writing our Authentication Service

Our authentication service will be responsible for one thing, and one thing only. Giving us an answer to whether or not a request has the correct Authorization header.

`auth/index.js`

```jsx
const express = require("express")
const createError = require('http-errors')
const app = express()

app.get('/authenticated',(req, res,next) => {
  const auth = req.headers.authorization
  console.log(auth)
  
  if(auth == null){
    return next(createError(401,'Auth headers not present'))
  }
    if (auth === "letmeinpleasekthxbye") {
      res.json({
        Authenticated: true
      })
    } else {
      return next(createError.Unauthorized())
    }
  })

const port = process.env.PORT || 8080

app.listen(port, () => {
  console.log(`auth_svc listening on ${port}`)
})
```

So, a simple web server wiith a single handler `/authenticated`, which simply checks whether the authorization header of the incoming request is our  defined auth string.

NOTE:

So, of course, this is not how actual authentication services work. However, this is the important part for displaying how to use an authentication service with NGINX.

 Let's imagine that our authentication service has a login handler (which is open to everyone), on success, this handler will return a JWT token. For every subsequent request, our client must include this JWT token in his Authorization header, granting him access to the rest of our services. Checking whether the JWT token is valid, will be the job of our `/authenticated`handler, returning a 401 or 200, just like our auth service does.

We can switch out authentication methods if appropriate, add external authentication services etc. The only thing important to us, is that our NGINX proxy can check the incoming request parameters for a valid token or equivalent.

## Setting up NGINX

Now that we have all our services that we want to be served by NGINX, we just need to configure our NGINX service.

`nginx/nginx.conf`

```jsx
events {
    worker_connections 1024;
}

http {

    resolver 127.0.0.11 valid=10s;

    server {
        listen 8080;

        location /coffee {
            auth_request /auth;
            set $coffee_service coffee:8080;
            proxy_pass http://$coffee_service/coffee;
        }

        location /tea {
            auth_request /auth;
            proxy_pass http://tea:8080/tea;
        }

        location /auth {
            internal;
            proxy_pass http://auth:8080/authenticated;
        }
    }
}
```

Lets break the code down

```jsx
events {
    worker_connections 1024;
}

http {

    resolver 127.0.0.11 valid=10s;

    server {
        listen 8080;
    ............

   }
}
```

So essentially, this simple NGINX config file sets the worker_connections (the maximum amount of concurrent connections) to 1024 and we define an http server, listening on port 8080.

`resolver 127.0.0.11 valid=10s;` -we add resolver at the top of our config, and setting the valid parameter to 10s. The valid parameter simply specifies that the TTL (Time to Live) of the DNS query result. This means, that when we scale up (or down) of services, NGINX will re-resolve our coffee and tea service addresses and get a response including all the current addresses.

```jsx
location /coffee {
            auth_request /auth;
            set $coffee_service coffee:8080;
            proxy_pass http://$coffee_service/coffee;
        }

 location /tea {
            auth_request /auth;
            auth_request_set $auth_status $upstream_status;
            proxy_pass http://tea:8080/tea;
        }
```

This server, will redirect request on url path /tea to our tea service container on port 8080 and same for /coffee.

NOTE: 

something to take note of with these locations are, that they are not strict. This means that all subrequest os `/coffee`, will also be passed onto our coffee service. So, if we decide to create a new handler with the URI of [http://coffee:8080/coffee/aeropress](http://coffee:8080/coffee/aeropress) and another called [http://coffee:8080/coffee/pourover](http://coffee:8080/coffee/pourover). These API endpoints can also be access via. our NGINX gateway, without making any changes to our configuration file.

Both the endpoints contains this `auth request /auth;` line which will pass our incoming request through our /auth location.

If this auth request is successful, the request will then be sent to our coffee or tea service, however, if the auth request is unsuccessful, NGINX will return an error status (such as 401).

```jsx
location /auth {
            internal;
            proxy_pass http://auth:8080/authenticated;
        }
```

At the bottom of our configuration we have added our auth location. This service is defined as internal, which ensures that anyone other than NGINX trying to access this location will get a 404 Not Found.

## Setting up Docker Compose

We will create a `docker-compose.yml` in our root directory, which will define our application to include our services and our nginx proxy:

`./dockercompose.yml`

```jsx
version: '3'
services:
  coffee:
    build: coffee/.
  tea:
    build: tea/.
  auth:
    build: auth/.
  nginx:
    image: nginx
    ports:
      - "8080:8080"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
```

- On our NGINX service, we are exposing our service on port 8080 (on the docker host) and mapping it to port 8080. We are also adding a volume, which in this case is a single file (our config file), which we are giving the container read-only access to with the `:ro` statement at the end of the volume statement. We are mapping this to /etc/nginx/nginx.conf, as this is the default file path of the NGINX configuration file.
- Other services like coffee, tea and auth are simply given names and a build command with their location in the directory.

All that is left to do is to just spin up `docker-compose up` and  afterwards, hit it up with POSTMAN.

