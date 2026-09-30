const express=require('express')
const router=express.Router()
const controller=require('./boscontroller')
router.post('/select',controller.select)
router.post('/add',controller.add);
router.delete('/add/:RentalId',controller.delete)
module.exports=router