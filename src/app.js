const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model')
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
module.exports = app;
