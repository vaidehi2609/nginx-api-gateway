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