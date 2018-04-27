import { Router } from 'express'
import Tx from '../models/Tx'
import { paginate } from '../helpers/utils'
import TxRepository from '../repositories/TxRepository'
import BlockRepository from '../repositories/BlockRepository'
import TokenTx from '../models/TokenTx'
import TokenTxRepository from '../repositories/TokenTxRepository'

const TxController = Router()

TxController.get('/txs', async (req, res) => {
  try {
    let block_num = !isNaN(req.query.block) ? req.query.block : null
    let params = {query: {status: true}, sort: {timestamp: -1}}
    if (block_num) {
      params.query = {blockNumber: block_num}
      // Get txs by block number.
      await BlockRepository.addBlockByNumber(block_num)
    }

    // Check filter type.
    if (req.query.filter) {
      switch (req.query.filter) {
        case 'latest':
          params.sort = {createdAt: -1}
          break
      }
    }

    // Check type listing is pending.
    let type = req.query.type
    let populates = [
      {
        path: 'block',
        select: 'timestamp',
      },
      {path: 'from_model'},
      {path: 'to_model'}]
    switch (type) {
      case 'pending':
        params.query = {blockNumber: null, block: null}
        params.limit = 0
        break
      case 'token':
        populates.push(
          {path: 'from_model', match: {isToken: true}})
        populates.push(
          {path: 'to_model', match: {isToken: true}})
        break
    }
    let address = req.query.address
    if (typeof address !== 'undefined') {
      params.query = Object.assign(params.query,
        {$or: [{from: address}, {to: address}]})
    }
    params.populate = populates
    let data = await paginate(req, 'Tx', params)

    return res.json(data)
  }
  catch (e) {
    console.log(e)
    throw e
  }
})

TxController.get('/txs/:slug', async (req, res) => {
  try {
    let hash = req.params.slug
    let tx = await TxRepository.getTxPending(hash)
    tx = await TxRepository.getTxReceipt(hash)
    // Re-find tx from db with populates.
    tx = await Tx.findOne({hash: tx.hash}).
      populate([{path: 'block'}, {path: 'from_model'}, {path: 'to_model'}]).lean()

    let tokenTxs = []
    if (tx) {
      // Append token transfer to tx.
      tokenTxs = await TokenTx.find({transactionHash: tx.hash}).
        lean().
        exec()

      tokenTxs = await TokenTxRepository.formatItems(tokenTxs)
    }
    tx.tokenTxs = tokenTxs

    return res.json(tx)
  }
  catch (e) {
    return res.status(404).send()
  }
})

export default TxController