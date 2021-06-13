import puppeteer from 'puppeteer'
import config from './config.json'
import { CBL } from './cbl'
import moment from 'moment'

const jsdom = require("jsdom");
const { JSDOM } = jsdom;
global.document = new JSDOM('<!DOCTYPE html><p>Hello world</p>').window.document;
var Canvas = require("canvas");
global.Image = Canvas.Image;
var headlessRun = false
const { email, password } = config
var offerId = ""
var productId = ""
var date = new moment().format('hh:mm:ss A')
var scDate = new moment().format('YYYY-MM-DD_hh-mm-ss');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const getElementTextContent = element => element?.textContent
const retry = async (promiseFactory, retryCount) => {
    try {
        return await promiseFactory();
    }
    catch (error) {
        if (retryCount <= 0) {
            throw error;
        }
        return await retry(promiseFactory, retryCount - 1);
    }
}
const checkForCaptcha = async (page) => {
    var pageElementText = (await page.content()).toString()
    if (pageElementText.includes('captcha') || pageElementText.includes('discuss automated access to Amazon')) {
        console.log('captcha detected')
        var passwordContinue = await page.$('#ap_password')
        if (passwordContinue) {
            await page.type('#ap_password', password)
            await page.keyboard.press('Enter')
            await page.waitForNavigation()
        }
        var cbl = new CBL({
            preprocess: function (img) {
                img.binarize(32);
                img.colorRegions(50, true, 1);
            },
            model_file: './model.txt',
            character_set: "ABCEFGHIJKLMNPRTUXY",
            exact_characters: 6,
            pattern_width: 24,
            pattern_height: 24,
            blob_min_pixels: 30,
            blob_max_pixels: 10000,
            allow_console_log: false,
            blob_console_debug: false
        });
        if (pageElementText) {
            var index = pageElementText.indexOf("https://images-na.ssl-images-amazon.com/captcha/")
            pageElementText = index != -1 ? pageElementText.substring(index, index + 79) : ""
            console.log(`CAPTCHA URL: ${pageElementText}`)
        }
        console.log('attempting to solve')
        var solution = await cbl.solve(pageElementText)
        console.log(`Done solving. Solution: ${solution}`)
        var captchaInput = await page.$('#captchacharacters')
        if (captchaInput) {
            await page.type('#captchacharacters', solution)
        }
        await page.keyboard.press('Enter');
        await page.waitForNavigation()
        pageElementText = (await page.content()).toString()
        if (pageElementText.includes('captcha') || pageElementText.includes('discuss automated access to Amazon')) {
            console.log('Captcha solve failed, trying again')
            return await checkForCaptcha(page)
        }
        return true
    }
    return false
}
const checkForPassword = async (page) => {
    var passwordEl = await page.$('#ap_password')
    if (passwordEl) {
        await page.type('#ap_password', password)
        await page.keyboard.press('Enter');
        await page.waitForNavigation()
    }
}
const goToPage = async (page, url) => {
    await retry(() => {
        return Promise.all([
            page.goto(
                url,
                { waitUntil: 'domcontentloaded', timeout: 15000 })
        ])
    }, 10)
}
const login = async (page) => {
    await goToPage(page, 'https://smile.amazon.com/ap/signin/ref=smi_ge2_ul_si_rl?_encoding=UTF8&ie=UTF8&openid.assoc_handle=amzn_smile&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.mode=checkid_setup&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.ns.pape=http%3A%2F%2Fspecs.openid.net%2Fextensions%2Fpape%2F1.0&openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fsmile.amazon.com%2Fgp%2Fcharity%2Fhomepage.html%3Fie%3DUTF8%26newts%3D1%26orig%3D%252F')
    await page.type('#ap_email', email)
    await page.click('#continue')
    await page.waitForNavigation()
    await page.type('#ap_password', password)
    var checkBoxEl = await page.$('[type="checkbox"]')
    if (checkBoxEl) {
        await page.click('[type="checkbox"]')
    }
    await page.click('#signInSubmit')
    await page.waitForNavigation()
    console.log(`[${date}] Logged In`)
}

const displayWelcome = (productText) => {
    console.log('======================================================')
    console.log(`Starting Offer ID Bot for ${productText.trim()}`)
    console.log('======================================================')
}
const checkForPopups = async (page) => {
    await checkForPassword(page)
    await checkForCaptcha(page)
}
const runAmabot = async () => {
    const browser = await puppeteer.launch({
        args: ['--disable-features=site-per-process'],
        headless: headlessRun
    })
    const page = await browser.newPage()
    await login(page)
    await goToPage(page, `https://smile.amazon.com/dp/${productId}`)
    await checkForPopups(page)
    let productElement = await page.$('#productTitle')
    let productText = await page.evaluate(getElementTextContent, productElement)
    await goToPage(page, `https://smile.amazon.com/gp/aws/cart/add-res.html?ASIN.1=${productId}&OfferListingId.1=${offerId}&Quantity.1=1&sa-no-redirect=1&pldnSite=1`)
    displayWelcome(productText)
    var purchased = false
    var errorCount = 0;
    while (!purchased) {
        date = new moment().format('hh:mm:ss A')
        scDate = new moment().format('YYYY-MM-DD_hh-mm-ss');
        await page.setCacheEnabled(false)
        try {
            await checkForCaptcha(page)
            var notAvailableError = await page.$('.a-color-warning')
            const price = await page.$eval('table tr td:nth-child(2)', el => { return el.innerHTML?.trim() });
            if (notAvailableError && !price) {
                errorCount = 0
                // Unavailable
                await sleep(500)
                try {
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 })
                } catch {
                    console.log(`[${date}] time out occurred`)
                }
            } else {
                await page.screenshot({ path: `screenshots/${scDate}_PURCHASE_ATTEMPT.png`, fullPage: true })
                console.log(`[${date}] Purchasing Item`)
                page.goto(`https://www.amazon.com/dp/${productId}`)
                await page.waitForSelector('#buy-now-button', { timeout: 5000 })
                page.screenshot({ path: `screenshots/${scDate}_PRODUCT_PAGE_AFTER_START.png`, fullPage: true })
                await checkForPopups(page)
                var buyNowButton = await page.$('#buy-now-button')
                if (buyNowButton) {
                    await page.click('#buy-now-button')
                    await page.waitForNavigation()
                    page.screenshot({ path: `screenshots/${scDate}_AFTER_BUY_NOW.png`, fullPage: true })
                    await checkForPopups(page)
                    var orderButton = await page.$('[name=placeYourOrder1]')
                    if (orderButton) {
                        console.log(`[${date}] order button found`)
                        await page.click('[name=placeYourOrder1]')
                        await page.waitForNavigation()
                        await page.waitForSelector('#widget-purchaseSummary', { timeout: 2000 })
                        await page.screenshot({ path: `screenshots/${scDate}_AFTER_PLACE_ORDER.png`, fullPage: true })
                        var purchaseSummary = await page.$('#widget-purchaseSummary')
                        if (purchaseSummary) {
                            console.log(`[${date}] Completed purchase for ${productText?.trim()}`)
                            purchased = true
                            return
                        } else {
                            errorCount++
                            console.log(`[${date}] Failed to purchase after clicking place order`)
                            await goToPage(page, `https://www.amazon.com/gp/aws/cart/add-res.html?ASIN.1=${productId}&OfferListingId.1=${offerId}&Quantity.1=1&sa-no-redirect=1&pldnSite=1`)
                        }
                    } else {
                        errorCount++
                        console.log(`[${date}] no order button`)
                    }
                } else {
                    errorCount++
                    console.log(`[${date}] no buy now button`)
                }
            }
        } catch {
            await page.screenshot({ path: `screenshots/${scDate}_DEBUG.png`, fullPage: true })
            console.log(`[${date}] Error occurred, going back to original offer ID`)
            await goToPage(page, `https://www.amazon.com/gp/aws/cart/add-res.html?ASIN.1=${productId}&OfferListingId.1=${offerId}&Quantity.1=1&sa-no-redirect=1&pldnSite=1`)
        }
        if (errorCount > 0) {
            console.log(`[${date}] Error Count larger than 0, going back to original offer ID`)
            await goToPage(page, `https://www.amazon.com/gp/aws/cart/add-res.html?ASIN.1=${productId}&OfferListingId.1=${offerId}&Quantity.1=1&sa-no-redirect=1&pldnSite=1`)
        }
    }
}
productId = process.argv[2]
offerId = process.argv[3]
if (process.argv[4] && process.argv[4].includes('headless')) {
    headlessRun = true
}
var fs = require('fs');
var dir = './screenshots';

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}
runAmabot()
