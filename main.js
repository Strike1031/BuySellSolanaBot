import fetch from "node-fetch";
import fs from "fs/promises";
import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { Wallet } from '@project-serum/anchor';
import axios from 'axios';

let selectedAddress = "So11111111111111111111111111111111111111112";
let selectedToken = "SOL";
let buyOrders, sellOrders;

let gridSpread = 1;
let fixedSwapVal = 0.001; //Swap Amount of Sol or Token
let slipTarget = 0.5;
let refreshTime = 5;

const usdcMintAddress_pub = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";  //USDC mainnet
// makeSellTransaction - Sell sol,  makeBuyTransaction - buy sol

async function getTokens() {
    try {
        const response = await axios.get('https://token.jup.ag/strict');
        const data = response.data;
        const tokens = data.map(({ symbol, address }) => ({ symbol, address }));
        await fs.writeFile('tokens.txt', JSON.stringify(tokens));
        console.log('Updated Token List');
    } catch (error) {
        console.error(error);
    }
}

dotenv.config();
//read keypair and decode to public and private keys.
const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY)));
// Replace with the Solana network endpoint URL
const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed', {
    commitment: 'confirmed',
    timeout: 60000
});


async function makeSellTransaction() {
    var fixedSwapValLamports = fixedSwapVal * 1000000000;
    var slipBPS = slipTarget * 100;
    const response = await fetch('https://quote-api.jup.ag/v6/quote?inputMint=' + selectedAddress + '&outputMint=' + usdcMintAddress_pub + '&amount=' + fixedSwapValLamports + '&slippageBps=' + slipBPS);
    const routes = await response.json();
    console.log('-----routes----', routes);
    const transaction_response = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            quoteResponse: routes,
            userPublicKey: wallet.publicKey.toString(),
            wrapUnwrapSOL: true,
        })
    });
    const transactions = await transaction_response.json();
    const { swapTransaction } = transactions;
    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    console.log("Making Sell Order!")
    // sign the transaction
    transaction.sign([wallet.payer]);
    // Execute the transaction
    const rawTransaction = transaction.serialize()
    const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
    });
    await connection.confirmTransaction({ signature: txid });
    console.log(`https://solscan.io/tx/${txid}`);
    sellOrders++;
}

async function makeBuyTransaction() {
    let currentPrice;
    const price_response = await fetch(
        `https://price.jup.ag/v4/price?ids=${selectedToken}`
    );

    if (price_response.ok) {
        const data = await price_response.json();
        if (data.data[selectedToken]) {
            currentPrice = data.data[selectedToken].price;
        } else {
            console.log('Cannot get price of the token');
            return;
        }
    }
    var usdcLamports = Math.floor((fixedSwapVal * currentPrice) * 1000000);
    var slipBPS = slipTarget * 100;
    const response = await fetch('https://quote-api.jup.ag/v6/quote?inputMint=' + usdcMintAddress_pub + '&outputMint=' + selectedAddress + '&amount=' + usdcLamports + '&slippageBps=' + slipBPS);
    const routes = await response.json();
    const transaction_response = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            quoteResponse: routes,
            userPublicKey: wallet.publicKey.toString(),
            wrapUnwrapSOL: true,
        })
    });

    const transactions = await transaction_response.json();

    const { swapTransaction } = transactions;
    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    console.log("Making Buy Order!");
    // sign the transaction
    transaction.sign([wallet.payer]);
    // Execute the transaction
    const rawTransaction = transaction.serialize()
    const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
    });
    await connection.confirmTransaction({ signature: txid });
    console.log(`https://solscan.io/tx/${txid}`);
    buyOrders++;
}


async function main() {
    try{
        // await makeBuyTransaction(); //Buy Sol from current tokens
        await makeSellTransaction(); //Sell Sol, and get tokens
    }
    catch(error){
        console.log(error);
    }
}
main()
