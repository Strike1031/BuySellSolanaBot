import fetch from "node-fetch";
import { Connection, Keypair, VersionedTransaction, PublicKey, sendAndConfirmRawTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { Wallet } from '@project-serum/anchor';

const selectedAddress = "So11111111111111111111111111111111111111112";
let fixedSwapVal = 0.001; //Swap Amount of Sol or Token
let slipTarget = 5;

// const usdcMintAddress_pub = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";  //USDC -token- on -mainnet
const usdcMintAddress_pub = "4vqYQTjmKjxrWGtbL2tVkbAU1EVAz9JwcYtd2VE3PbVU";  //Anita Max Wynn token - token- on mainnet
// makeSellTransaction - Sell sol,  makeBuyTransaction - buy sol


dotenv.config();
//read keypair and decode to public and private keys.
const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY)));
// Replace with the Solana network endpoint URL
const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed', {
    commitment: 'confirmed',
    timeout: 10000
});



async function makeTransaction(type) {
    const fixedSwapValLamports = Math.floor(fixedSwapVal * 1000000000);
    const slipBPS = slipTarget * 100;
    let response;
    if (type == "buy") {
        response = await fetch('https://quote-api.jup.ag/v6/quote?inputMint=' + selectedAddress + '&outputMint=' + usdcMintAddress_pub + '&amount=' + fixedSwapValLamports + '&onlyDirectRoutes=true');
    }else  {
        response = await fetch('https://quote-api.jup.ag/v6/quote?inputMint=' + usdcMintAddress_pub + '&outputMint=' + selectedAddress + '&amount=' + fixedSwapValLamports + '&swapMode=ExactOut' + '&onlyDirectRoutes=true');
    }
    const routes = await response.json();
    console.log('----routes------',routes);
    const transaction_response = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            quoteResponse: routes,
            userPublicKey: wallet.publicKey.toString(),
            wrapUnwrapSOL: true,
            prioritizationFeeLamports: "auto",
            dynamicComputeUnitLimit: true,
        })
    });
    // console.log('-----------swaps-----------', transaction_response);
    const transactions = await transaction_response.json();
    const { swapTransaction } = transactions;
    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    console.log("Making" + type + "Order!");
    // sign the transaction
    transaction.sign([wallet.payer]);
    // Execute the transaction
    const rawTransaction = transaction.serialize()
    const txid = await sendAndConfirmRawTransaction(connection, rawTransaction, null, {
        skipPreflight: true,
        maxRetries: 2
    });
    console.log(`https://solscan.io/tx/${txid}`);
}


async function main() {
    try{
        await makeTransaction("Buy"); //Buy Token
        await makeTransaction("Sell"); //Sell Token
    }
    catch(error){
        console.log(error);
    }
}
main()
