import fetch from "node-fetch";
import fs from "fs/promises";
import chalk from "chalk";
import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { Wallet } from '@project-serum/anchor';
import axios from 'axios';

//vars for user inputs

let selectedAddress;
let selectedToken = "";
let gridSpread = 1;
//let devFee = 0.1;
let fixedSwapVal = 0.001; //how much (token or Sol) do you want to swap
let slipTarget = 0.5;
let refreshTime = 5;
const tokenSymbol = "SOL";
const usdcMintAddress_pub = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";  //USDC mainnet
// const usdcMintAddress_pub = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"; //USDC devent
const usdcMintAddress = new PublicKey(usdcMintAddress_pub); //USDC devnet

async function getTokens() {
    try {
        const response = await axios.get('https://token.jup.ag/strict');
        const data = response.data;
        const tokens = data.map(({ symbol, address }) => ({ symbol, address }));
        await fs.writeFile('tokens.txt', JSON.stringify(tokens));
        console.log('Updated Token List');
        return tokens;
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

//api request data for URL query on swaps
class Tokens {
    constructor(mintSymbol, vsTokenSymbol, price) {
        this.mintSymbol = mintSymbol;
        this.vsTokenSymbol = vsTokenSymbol;
        this.price = price;
    }
}

class PriceData {
    constructor(selectedToken) {
        this.selectedToken = selectedToken;
    }
}

class PriceResponse {
    constructor(data, timeTaken) {
        this.data = data;
        this.timeTaken = timeTaken;
    }
}

async function main() {
    await getTokens();
    let tokens = JSON.parse(await fs.readFile('tokens.txt'));

    const token = tokens.find((t) => t.symbol === tokenSymbol);
    if (token) {
        console.log(`Selected Token: ${token.symbol}`);
        console.log(`Token Address: ${token.address}`);
        selectedToken = token.symbol;
        selectedAddress = token.address;
    } else {
        console.log(`Token ${tokenSymbol} not found.`);
        return;
    }

    while (true) {
        console.clear();

        console.log(`Selected Token: ${selectedToken}`);
        console.log(`Selected Grid Spread: ${gridSpread}%`);
        //console.log(`Selected Developer Donation: ${devFee}%`);
        console.log(`Swapping ${fixedSwapVal} ${selectedToken} per layer.`);
        console.log(`Slippage Target: ${slipTarget}%`)
        console.log("");
        break;
    }
    refresh(selectedToken);
    // Run refresh() function every 
    // setInterval(() => {
    //     refresh(selectedToken);
    // }, refreshTime * 1000);
}

//Init Spread Calculation once and declare spreads
var gridCalc = true;
let spreadUp, spreadDown, spreadIncrement;
let solBalance, usdcBalance, solBalanceStart, usdcBalanceStart, accountBalUSDStart, accountBalUSDCurrent;
let buyOrders, sellOrders;
var currentPrice;
var lastPrice;
var direction;

async function refresh(selectedToken) {
    const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${selectedToken}`
    );

    if (response.ok) {
        const data = await response.json();

        if (data.data[selectedToken]) {
            const priceResponse = new PriceResponse(
                new PriceData(
                    new Tokens(
                        data.data[selectedToken].mintSymbol,
                        data.data[selectedToken].vsTokenSymbol,
                        data.data[selectedToken].price
                    )
                ),
                data.timeTaken
            );
            console.clear();
            console.log(
                `Grid: ${priceResponse.data.selectedToken.mintSymbol} to ${priceResponse.data.selectedToken.vsTokenSymbol}`
            );
            console.log("");
            console.log("Settings:");
            console.log(`Grid Width: ${gridSpread}%`);
            //console.log(`Developer Donation: ${devFee}%`);
            console.log(`Swapping ${fixedSwapVal}${selectedToken} per Grid`);
            console.log(`Maximum Slippage: ${slipTarget}%`);
            console.log("");

            //Create grid values and array once
            if (gridCalc) {
                usdcBalanceStart = 0;
                spreadDown = priceResponse.data.selectedToken.price * (1 - (gridSpread / 100));
                spreadUp = priceResponse.data.selectedToken.price * (1 + (gridSpread / 100));
                spreadIncrement = (priceResponse.data.selectedToken.price - spreadDown);
                currentPrice = priceResponse.data.selectedToken.price;
                lastPrice = priceResponse.data.selectedToken.price;
                buyOrders = 0;
                sellOrders = 0;

                //Get Start Balances
                await (async () => {
                    const solBalance = await connection.getBalance(wallet.publicKey);
                    solBalanceStart = solBalance / 1000000000;
                    console.log(`SOL Balance: ${solBalanceStart.toFixed(4)}`);
                })();
                if (!usdcBalanceStart) {
                    let usdcBalanceStart;
                    try {
                        usdcAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: usdcMintAddress });
                        const usdcAccountInfo = usdcAccounts && usdcAccounts.value[0] && usdcAccounts.value[0].account;
                        const usdcTokenAccount = usdcAccountInfo.data.parsed.info;
                        usdcBalanceStart = usdcTokenAccount.tokenAmount.uiAmount;
                    } catch (e) {
                        usdcBalanceStart = 0;
                    }
                }
                accountBalUSDStart = (solBalanceStart * currentPrice) + usdcBalanceStart;
                gridCalc = false;
            }
            console.log(`TokenA Start Balance: ${solBalanceStart.toFixed(4)}`);
            console.log(`TokenB Start Balance: ${usdcBalanceStart.toFixed(4)}`);
            console.log("");

            await (async () => {
                const balance = await connection.getBalance(wallet.publicKey);
                const currentBalance = balance / 1000000000
                console.log(`Current TokenA Balance: ${currentBalance}`);
                let currentUsdcBalance;
                try {
                    const usdcAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: usdcMintAddress });
                    const usdcAccountInfo = usdcAccounts && usdcAccounts.value[0] && usdcAccounts.value[0].account;
                    const usdcTokenAccount = usdcAccountInfo.data.parsed.info;
                    currentUsdcBalance = usdcTokenAccount.tokenAmount.uiAmount;
                } catch (e) {
                    currentUsdcBalance = 0;
                }

                accountBalUSDCurrent = (currentBalance * currentPrice) + currentUsdcBalance;
                console.log(`Current TokenB Balance: ${currentUsdcBalance.toFixed(4)}`);
                console.log("");
                console.log(`Start Total USD Balance: ${accountBalUSDStart.toFixed(4)}`);
                console.log(`Current Total USD Balance: ${accountBalUSDCurrent.toFixed(4)}`);
                //var solDiff = (currentBalance - solBalanceStart);
                //var usdcDiff = (currentUsdcBalance - usdcBalanceStart);
                //var profit = (solDiff * currentPrice) + usdcDiff;
                var profit = accountBalUSDCurrent - accountBalUSDStart;
                console.log("");
                console.log(`Current Profit USD: ${profit.toFixed(4)}`)
                console.log("");
                console.log(`Buy Orders: ${buyOrders}`);
                console.log(`Sell Orders: ${sellOrders}`);
            })();


            //Monitor price to last price difference.
            currentPrice = priceResponse.data.selectedToken.price.toFixed(4);
            console.log('--------Current token Price--------', currentPrice);
            if (currentPrice > lastPrice) { direction = "Trending Up" };
            if (currentPrice === lastPrice) { direction = "Trending Sideways" };
            if (currentPrice < lastPrice) { direction = "Trending Down" };
            console.log(direction);

            //Monitor current price and trend, compared to spread
            console.log("");

            /**    BUY and SELL */
            console.log("Crossed Down! - Create Buy Order");
            await makeBuyTransaction();
            console.log("Shifting Layers Up");
            //create new layers to monitor
            spreadUp = spreadUp - spreadIncrement;
            spreadDown = spreadDown - spreadIncrement;

            // if (currentPrice >= spreadUp) {
            //     console.log("Crossed Above! - Create Sell Order");
            //     await makeSellTransaction();
            //     console.log("Shifting Layers Up");
            //     //create new layers to monitor
            //     spreadUp = spreadUp + spreadIncrement;
            //     spreadDown = spreadDown + spreadIncrement;
            // }

            // if (currentPrice <= spreadDown) {
            //     console.log("Crossed Down! - Create Buy Order");
            //     await makeBuyTransaction();
            //     console.log("Shifting Layers Down");
            //     //create new layers to monitor
            //     spreadUp = spreadUp - spreadIncrement;
            //     spreadDown = spreadDown - spreadIncrement;
            // }
            /** */
            console.log(chalk.red(`Spread Up: ${spreadUp.toFixed(4)}`, "-- Sell"));
            console.log(`Price: ${priceResponse.data.selectedToken.price.toFixed(4)}`);
            console.log(chalk.green(`Spread Down: ${spreadDown.toFixed(4)}`, "-- Buy"));
            console.log("");
            lastPrice = priceResponse.data.selectedToken.price.toFixed(4);
        } else {
            console.log(`Token ${selectedToken} not found`);
            selectedToken = null;
            main();
        }
    } else {
        console.log(`Request failed with status code ${response.status}`);
    }
}
async function makeSellTransaction() {
    var fixedSwapValLamports = fixedSwapVal * 1000000000;
    var slipBPS = slipTarget * 100;
    // retrieve indexed routed map
    // const indexedRouteMap = await (await fetch('https://quote-api.jup.ag/v6/indexed-route-map')).json();
    // const getMint = (index) => indexedRouteMap["mintKeys"][index];
    // const getIndex = (mint) => indexedRouteMap["mintKeys"].indexOf(mint);

    // // generate route map by replacing indexes with mint addresses
    // var generatedRouteMap = {};
    // Object.keys(indexedRouteMap['indexedRouteMap']).forEach((key, index) => {
    //     generatedRouteMap[getMint(key)] = indexedRouteMap["indexedRouteMap"][key].map((index) => getMint(index))
    // });
    const response = await fetch('https://quote-api.jup.ag/v6/quote?inputMint=' + selectedAddress + '&outputMint=' + usdcMintAddress_pub + '&amount=' + fixedSwapValLamports + '&slippageBps=' + slipBPS);
    const routes = await response.json();
    console.log('----routes---', routes);
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
        maxRetries: 5
    });
    await connection.confirmTransaction(txid);
    console.log(`https://solscan.io/tx/${txid}`);
    sellOrders++;
}

async function makeBuyTransaction() {
    var usdcLamports = Math.floor((fixedSwapVal * currentPrice) * 1000000);
    var slipBPS = slipTarget * 100;
    // retrieve indexed routed map
    console.log('-------Before index-route-map-----------------');
    // const indexedRouteMap = await (await fetch('https://quote-api.jup.ag/v6/indexed-route-map')).json();
    // console.log('--------indexedRouterMap-------', indexedRouteMap);
    // const getMint = (index) => indexedRouteMap["mintKeys"][index];
    // const getIndex = (mint) => indexedRouteMap["mintKeys"].indexOf(mint);

    // generate route map by replacing indexes with mint addresses
    // var generatedRouteMap = {};
    // Object.keys(indexedRouteMap['indexedRouteMap']).forEach((key, index) => {
    //     generatedRouteMap[getMint(key)] = indexedRouteMap["indexedRouteMap"][key].map((index) => getMint(index))
    // });
    console.log('----selectedAddress----', selectedAddress);
    console.log('----------usdcMintAddress_pub--------', usdcMintAddress_pub);
    console.log('---------usdcLamports------------', usdcLamports);
    console.log('----------slipBPS-------------', slipBPS);

    const response = await fetch('https://quote-api.jup.ag/v6/quote?inputMint=' + usdcMintAddress_pub + '&outputMint=' + selectedAddress + '&amount=' + usdcLamports + '&slippageBps=' + slipBPS);
    const routes = await response.json();
    console.log('--------routes----------', routes);
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
    console.log('------transactions------', transactions);

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
        maxRetries: 5
    });
    await connection.confirmTransaction(txid);
    console.log(`https://solscan.io/tx/${txid}`);
    buyOrders++;
}
main();
