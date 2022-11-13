const express = require('express');
const bodyParser = require('body-parser');
const { sequelize, Profile } = require('./model')
const Op = require('sequelize').Op
const { getProfile } = require('./middleware/getProfile')
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
    console.log("here")
    const { Contract } = req.app.get('models')
    const { id } = req.params
    console.log("req.profile", req.profile)
    const contract = await Contract.findOne({ where: { id: id, clientId: req.profile.id }, })
    console.log("contract", contract);
    if (!contract) return res.status(404).end()
    res.json(contract)
})

app.get('/contracts', getProfile, async (req, res) => {
    console.log("here")
    const { Contract } = req.app.get('models')
    const contract = await Contract.findAll({
        where: {
            clientId: req.profile.id,
            status: { [Op.not]: 'terminated' }
        }
    })
    if (!contract) return res.status(404).end()
    res.json(contract)
})

app.get('/jobs/unpaid', getProfile, async (req, res) => {
    const { Contract, Job } = req.app.get('models')
    const job = await Contract.findAll({
        raw: true,
        include: { model: Job, where: { paid: null } },
        where: { clientId: req.profile.id },
        attributes: { exclude: ["id", "terms", "status", "createdAt", "updatedAt"] },
    })
    if (!job) return res.status(404).end()
    res.json(job)
})


app.post('/jobs/:job_id/pay', getProfile, async (req, res) => {
    const { Profile, Contract, Job } = req.app.get('models')
    const jobId = req.params.job_id
    const job = await Contract.findAll({
        raw: true,
        include: [{ model: Job, where: { paid: null, id: jobId }, attributes: { exclude: ["description", "createdAt", "updatedAt"] } }],
        where: { clientId: req.profile.id },
        attributes: { exclude: ["terms", "status", "createdAt", "updatedAt"] },
    })

    const profile = await Profile.findOne({ where: { id: req.profile.id }, attributes: ['id', 'balance'] })

    if (!profile || !job) return res.status(404).end()
    console.log(job)
    if (profile.balance < job[0]['Jobs.price']) return res.json('insufficient funds')

    try {

        const result = await sequelize.transaction(async (t) => {
            const remainedBalance = profile.balance - job[0]['Jobs.price']
            console.log("remainedBalance", remainedBalance)
            return Promise.all([
                Profile.update({ balance: remainedBalance, }, { where: { id: job[0]['ClientId'] } }, { transaction: t }),
                Job.update({ paid: true, paymentDate: Date.now() }, { where: { id: job[0]['Jobs.id'] } }, { transaction: t }),
                Contract.update({ status: "terminated", }, { where: { id: job[0]['id'] } }, { transaction: t }),
                Profile.increment({ balance: +job[0]['Jobs.price'] }, { where: { id: job[0]['ContractorId'] } }, { transaction: t })
            ]).then((res)=>{
                return "updated"
            })

        });

        res.status(200).json(result)

    } catch (error) {
        console.log(error)
        throw new Error(error.message)
    }


})
app.get('/admin/best-profession', async (req, res) => {
    const { Contract, Job,Profile } = req.app.get('models')
    const professions = await Profile.findAll({
        raw: true,
        include: [
            {
                model: Contract, as: 'Contractor',
                include: {
                    model: Job, where: { paid: true }, attributes: {
                        exclude: ["id", "description", "createdAt", "updatedAt", "ContractId","paid"]
                    },  
                },
                attributes:{exclude: ["id","terms","createdAt","updatedAt","ContractorId","ClientId"]}
            }
        ],
        where:{type: 'contractor'},
        attributes: { exclude: ["id","firstName","lastName","balance","type","createdAt","updatedAt"] },
    })
    const professionDict={}
    professions.map(profession=>{
        console.log
        professionDict[profession['profession']] +=  profession['Contractor.Jobs.price'] | 0
    })
    if (!professionDict) return res.status(404).end()
    res.json(professionDict)
})
//?start=<date>&end=<date></date>



/*
Contract.create({
      id:9,
      terms: 'bla bla bla',
      status: 'in_progress',
      ClientId: 4,
      ContractorId: 8
    }),
    Job.create({
      description: 'work',
      price: 200,
      ContractId: 1,
    }),
    Profile.create({
      id: 8,
      firstName: 'Aragorn',
      lastName: 'II Elessar Telcontarvalds',
      profession: 'Fighter',
      balance: 314,
      type:'contractor'
    }),
*/
module.exports = app;
