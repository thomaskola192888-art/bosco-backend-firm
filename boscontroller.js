  const Pool=require("./database1")
  exports.select= async(req,res)=>{
    const {equipmentId,customer_name,quantity,rental_date,return_date}=req.body;
    //validation
    if(!equipmentId || !customer_name || !quantity || !rental_date || !return_date ){
        return res.status(400).json({error:'missing required fields'})
    }
    const qty =Number(quantity);
    if(isNaN(qty) || qty<= 0){
        return res.status(400).json({error:'Invalid quantity'})
    }
    const rentalDate=new Date(rental_date)
    const returnDate=new Date(return_date)
    if(isNaN(rentalDate) || isNaN(returnDate)){
        return res.status(400).json({error:'invalid format'})
    }
    if(returnDate < rentalDate){
        return res.status(400).json({error:'invalid'})
    }

    //select equipments
    let connection;
    try{
        //get connection safely
         connection = await Pool.getConnection()
        await connection.beginTransaction();
        //check customername
        const CustomerName=`SELECT id,customer_name FROM rentals WHERE customer_name=?`
        const [resultName]=await connection.execute(CustomerName,[customer_name.trim()]);
        if(resultName.length >0){
            await connection.rollback();
            return res.status(409).json({error:"failed",message:'CustomerName already exists'})
        }
    //insert customername
    
        //fetch equipment
        const sql=`SELECT id,name,category,price_per_day,total_stock,available_stock FROM equipments WHERE id=?`;
       const[rows] = await connection.query(sql,[equipmentId])
            if(!rows || rows.length===0){
                await connection.rollback();
                return res.status(404).json({error:'equipment not found'})
            }
            const equipment=rows[0];
            console.log("EQUIPMENT",equipment)
            console.log("AVAILABLE STOCK",equipment.available_stock)
            console.log("REQUISTED",qty)

            if (Number(equipment.available_stock) < Number(qty)){
                await connection.rollback();
                return res.status(400).json({error:'failed',message:'Not enough equipments.visit our office for more information'})
            }
        
        
            //calculate cost
            const rentalDays=(return_date,rental_date)=>{
                const ms=new Date(return_date)- new Date(rental_date);
                return Math.max(1,Math.ceil(ms / (1000*60*60*24)))
            }
            const days=rentalDays(return_date,rental_date);
            const totalCost=equipment.price_per_day * qty * days;
            console.log({
                rental_date,return_date,qty,price_per_day:equipment.price_per_day,days,totalCost
            })
            //update stock
            const updateStock='UPDATE equipments SET available_stock= available_stock -? WHERE id=? AND available_stock > 0'
             const [updates]= await connection.query(updateStock,[qty,equipmentId])
             if(updates.affectedRows===0){
                await connection.rollback();
                return res.status(409).json({error:'failed',message:'Equipments no longer exists'})
             }
                // save into rentals
                const saveRental='INSERT INTO rentals(equipments_id,customer_name,rental_date,return_date,quantity,total_cost) VALUES(?,?,?,?,?,?)'
                const [result]=await  connection.query(saveRental,[equipmentId,customer_name,rental_date,return_date,qty,totalCost]);
                
                //load summery
                const summery=`SELECT r.id AS rental_id, r.customer_name,r.rental_date,r.return_date,r.quantity,r.total_cost,e.name AS equipment_name FROM rentals AS r INNER JOIN equipments AS e ON r.equipments_id=e.id WHERE r.id=?`;
                const [summeryrows]= await connection.query(summery,[result.insertId]);
                 
                //commit a transactions
              await connection.commit()
                return res.status(201).json({
    
                    summery:summeryrows[0],
                    EquipmentId:updates[0]
                })
            
    
} catch(error){
      if(connection) await connection.rollback();
       console.error('Transaction error:' ,error);
       res.status(500).json({
        message:'failed',
        error:error.message
       })

    }finally{
       if(connection) connection.release();
    }
}
exports.add=async(req,res)=>{
     const {AdminName,AdminID,HolderName}=req.body
     console.log(req.body)
     //validate data from the frontend
    if(!AdminName || !AdminID || !HolderName) {
        return res.status(400).json({error:'failed',message:'all field are required'})
    } 
    const ID=Number(AdminID);
    if(isNaN(ID) || AdminID.toString().length!==6){
        console.log("id",ID)
        return res.status(400).json({error:'failed',message:'invalid id'})
    }
    let conn;
    //connect to database
    try{
        conn=await Pool.getConnection();
        //begin a transaction
        await conn.beginTransaction();
        //get admin details from the database
      const details=`SELECT id ,admin_Name ,admin_Id FROM admins WHERE admin_Name=? AND admin_id=?`
      const [data]=await conn.execute(details,[AdminName,AdminID]);
      if(data.length===0){
        await conn.rollback()
        return res.status(400).json({error:'failed',message:'Invalid admin name or ID'});
      }
      const user=data[0]
      console.log(user)
      //check if holder exists
      const holder=`SELECT id, customer_name  FROM rentals WHERE  customer_name=?`;
      const [admin]= await conn.execute(holder,[HolderName.trim()]);
      if(admin.length===0){
        await conn.rollback();
        return res.status(409).json({error:'failed',message:'HolderName do not exist'})
      }
      const reciever=admin[0]
      console.log(reciever)
      //load holder rental details
     const rentalDetails=`
     SELECT r.id AS rental_id,r.customer_name,r.rental_date,r.return_date ,r.quantity,r.total_cost,e.name AS equipment_name
     FROM rentals AS r INNER JOIN equipments AS e ON r.equipments_id=e.id WHERE r.customer_name=? 
     `;
     const [summeryData]=await conn.execute(rentalDetails,[reciever.customer_name]);
     if(!summeryData || summeryData.length===0){
        await conn.rollback();
        return res.status(400).json({error:'failed',message:'rental details not found'});
 
     }
     await conn.commit()
     return res.status(201).json({
        data:data[0],
         admin:admin[0],
        returnSummery:summeryData[0],
        rentalId:summeryData[0].rental_id
     })
    }catch(error){
        if(conn) await conn.rollback();
        res.status(500).json({error:error.message});
    }
    finally{
        if(conn) conn.release();
    }

}
exports.delete=async(req,res)=>{
    const {RentalId}=req.params;
    let con;
    try{
        con=await Pool.getConnection()
        await con.beginTransaction();
        const info=`SELECT r.id AS rental_id,r.equipments_id,r.customer_name,r.quantity,
        r.rental_date,r.return_date,r.total_cost,e.name as equipment_name FROM rentals AS r 
        INNER JOIN equipments AS e ON r.equipments_id=e.id WHERE r.id=?`
         const [Result]=await con.execute(info,[RentalId]);
         if(Result.length===0){
            await con.rollback()
            return res.status(404).json({error:"failed",message:"rentals not found"})
         }
         const rezult=Result[0]
         console.log(Result);
         //DELETE rentals
         const SQl=`DELETE FROM rentals WHERE id=?`
         const [ROWS]= await con.execute(SQl,[RentalId]);
         if(ROWS.affectedRows===0){
            await con.rollback();
            return res.status(404).json({message:'rentaldetails could not be return'});
         }
         //update stock
         const STock=`UPDATE equipments SET available_stock=available_stock +? WHERE id=?`
         await con.execute(STock,[rezult.quantity,rezult.equipments_id]);
       await con.commit()
       return res.status(201).json({
        message:"Equipment return successfully"
       }) 

    }catch(error){
        await con.rollback()
         res.status(500).json({message:"server error"})
    }finally{
       if(con){
        con.release();
       }
    }


}