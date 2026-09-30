require('dotenv').config();
const express=require('express')
const app=express()
const cors=require('cors')
const router=require('./bosrouter')
//insert meddleware
app.use(express.json())
app.use(cors())

//use routes
app.use('/equipments',router)
app.use('/Return',router)
app.use('/Return',router)
//404 handler
app.use((req,res)=>{
    res.status(404).json({error:"route not found"})
})
//globall error handler
app.use((err,req,res,next)=>{
    console.error(err.stack);
    res.status(500).json({error:'something went wrong'})
})
//run at a port
const PORT=process.env.PORT || 3800;
app.listen(PORT,()=>{
    console.log(`running at http://localhost:${PORT}`)
});