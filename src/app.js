const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model')
const { Op } = require("sequelize");
const {getProfile} = require('./middleware/getProfile')
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * FIX ME!
 * @returns contract by id
 */

app.get('/contracts/:id', getProfile, async (req, res) =>{
    const { Contract } = req.app.get('models')
    const { id } = req.params;
    const { profile } = req;
    const userId = profile.dataValues.id;
    const contract = await Contract.findOne({where: {id}})
    const contractorId = contract.ContractorId;
    const clientId = contract.ClientId;
    const authorizedUsers = [clientId, contractorId];
    if(!contract) return res.status(401).end()
    if (!authorizedUsers.includes(userId)) return res.send(401, 'Not Authorized');
    res.json(contract)
})

app.get('/contracts', getProfile, async(req, res) => {
    const { Contract } = req.app.get('models')
    const { profile } = req;
    const userId = profile.dataValues.id;
    const userType = profile.dataValues.type;
    let query = { status: ['new', 'in_progress'] };
    if (userType === 'contractor') {
        query = { ...query, ContractorId: userId}
    }
    if (userType === 'client') {
        query = { ...query, ClientId: userId }
    }
    const contracts = await Contract.findAll({
        where: query
      });
    return res.json(contracts)
});

app.get('/jobs/unpaid', getProfile, async(req, res) => {
    const { Contract, Job } = req.app.get('models')
    const { profile } = req;
    const userId = profile.dataValues.id;
    const userType = profile.dataValues.type;
    let query = { status: ['in_progress'] };
    if (userType === 'contractor') {
        query = { ...query, ContractorId: userId}
    }
    if (userType === 'client') {
        query = { ...query, ClientId: userId }
    }
    const contracts = await Contract.findAll({
        attributes: ['id'],
        where: query
      });
    let contractArr = [];
    contracts.map( c => {
        contractArr.push(c.id);
    })
    const jobs = await Job.findAll({
        where : { 
            contractId : contractArr,
            paid : null
        }
    });
    return res.json(jobs)
})

app.post('/jobs/:job_id/pay', getProfile, async (req, res) => {
    const { Contract, Job, Profile } = req.app.get('models');
    const jobId  = req.params.job_id;
    const job = await Job.findOne({ where : {id: jobId}});

    const client = req.profile;
    // check balance
    const contract = await Contract.findOne({ where : { id: job.ContractId}});
    const { ContractorId } = contract;
    const contractor = await Profile.findOne({where : {id: ContractorId}});

    // We are getting the balance from the logged user.
    let canPay = false;
    let clientBalanceAfterPay = null;
    let contractorBalance = null;
    if (job.price < client.balance) {
        canPay = true;
        //Pay 
        clientBalanceAfterPay = client.balance - job.price;
        contractorBalance = contractor.balance + job.price;
        // Atomic transaction start
        try {
            const result = await sequelize.transaction(async (t) => {
              const updateTx = await contractor.update({
                balance: contractorBalance
              }, { transaction: t });
          
              await client.update({
                balance: clientBalanceAfterPay,
              }, { transaction: t });
              return updateTx;
          
            });
            // If the execution reaches this line, the transaction has been committed successfully
            // `result` is whatever was returned from the transaction callback (the `updateTx`, in this case)
          
          } catch (error) {
                throw new Error(error.message);
            // If the execution reaches this line, an error occurred.
            // The transaction has already been rolled back automatically by Sequelize!
          }
        // Atomic transaction ends
        res.json({ jobId, clientBalance: clientBalanceAfterPay});
    } else {
        res.status(200).json({error: "Insufficient Balance"});
    }
});

app.post("/balances/deposit/:userId", getProfile, async (req, res) => {
    const { amount } = req.body;
    const { Contract, Job, Profile } = req.app.get('models');
    const userId  = req.params.userId;
    const client = await Profile.findOne({ where: { id: userId } });
    // calculate jobs to paid
    const contracts = await Contract.findAll({where: { ClientId: client.id}});
    /** 
     * get jobs by contract - This should be a service but for delivery motives I'll add it here.
     */
     let contractArr = [];
     contracts.map( c => {
         contractArr.push(c.id);
     })
     const jobs = await Job.findAll({
        where : { 
            contractId : contractArr,
            paid : null
        }
    });
    let pendingPayment = 0;
    jobs.map( j => {
        pendingPayment = pendingPayment + j.price
    });
    const amountMaxAllowedPercentage = 25; // limit deposit to 25% 
    const amountMaxAllowedValue = (pendingPayment * amountMaxAllowedPercentage) / 100;
    if (amount > amountMaxAllowedValue) {
        // if amount to deposit is higher than the amount maximum allowed, we should decline the tx.
        return res.json({ error: 'Amount exceeds maximum allowed' });
    }
    try {
         await client.update({
            balance : client.balance + amount
        });
    } catch (e) {
        throw new Error(e);
    }
    return res.send({balance: client.balance, userId});
    
});

app.get('/admin/best-profession', getProfile, async (req, res) => {
    const { Contract, Job, Profile } = req.app.get('models');
    console.log(req.query)
    const jobs = await Job.findAll({
        where : 
        {   paid: true, 
            paymentDate: {
                [Op.lt]: new Date(req.query.end),
                [Op.gt]: new Date(req.query.start)
            } 
        },
        attributes: ['ContractId', 'price', 'id'],
        order: sequelize.col('ContractId'),
    });
    let completedJobs = [];
    jobs.map(id => {
        completedJobs.push(id.dataValues.ContractId);
    })
    console.log(completedJobs)
    const contracts = await Contract.findAll( { where: { id: completedJobs}, attributes: ['id', 'ContractorId'] });
    let jobsByContractId = [];
    let amount = 0;
    let collectedAmountByContract = {};
    // calculate contract Total Price Per contractor
    console.log(contract)
    contracts.map(c => {
        jobs.map(job => {
            if (job.ContractId == c.id) {
                amount = amount + parseInt(job.price);
                collectedAmountByContract = {...collectedAmountByContract, [c.id]: amount};
            } else {
                amount = 0;
            }
        });
    })
    // const contractors = await 
    let contractorsId = []
    contracts.map(c => {
        contractorsId.push(c.dataValues.ContractorId)
    });
    let contractorsTopSellers = await Profile.findAll({where : {id: contractorsId}});
    res.json({jobs, contracts, collectedAmountByContract, contractorsId, contractorsTopSellers});
});
module.exports = app;