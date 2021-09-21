import puppeteer from 'puppeteer'
import config from './config.json'
import offerIds from './OfferIds.json'
import testIds from './TestOfferIds.json'
import { CBL } from './cbl'
import moment from 'moment'

const jsdom = require("jsdom");
const { JSDOM } = jsdom;
global.document = new JSDOM('<!DOCTYPE html><p>Hello world</p>').window.document;
var Canvas = require("canvas");
global.Image = Canvas.Image;
var testMode = false
var headlessRun = false
var verbose = false
var captchaChecking = false
const { email, password } = config
var date = new moment().format('hh:mm:ss A')
var scDate = new moment().format('YYYY-MM-DD_hh-mm-ss');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
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
const output = (message) => {
    if (verbose) {
        console.log(`[${date}] ${message}`)
    }
}
const checkForCaptcha = async (page) => {
    if (!captchaChecking) { return }
    var pageElementText = (await page.content()).toString()
    if (pageElementText.includes('captcha') || pageElementText.includes('discuss automated access to Amazon')) {
        output('captcha detected')
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
            output(`CAPTCHA URL: ${pageElementText}`)
        }
        output('attempting to solve')
        var solution = await cbl.solve(pageElementText)
        output(`Done solving. Solution: ${solution}`)
        var captchaInput = await page.$('#captchacharacters')
        if (captchaInput) {
            await page.type('#captchacharacters', solution)
        }
        await page.keyboard.press('Enter');
        await page.waitForNavigation()
        pageElementText = (await page.content()).toString()
        if (pageElementText.includes('captcha') || pageElementText.includes('discuss automated access to Amazon')) {
            output('Captcha solve failed, trying again')
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
    output(`Logged In`)
}

const displayWelcome = (count) => {
    console.log('======================================================')
    console.log(`Successfully Booted Offer ID Bot for ${count} listings`)
    console.log('======================================================')
}
const checkForPopups = async (page) => {
    await checkForPassword(page)
    await checkForCaptcha(page)
}
const runAmabot = async () => {
    try {
        const browser = await puppeteer.launch({
            args: ['--disable-features=site-per-process'],
            headless: headlessRun
        })
        const page = await browser.newPage()
        await login(page)
        page.close()
        let ids = testMode ? testIds : offerIds
        ids.filter(o => o.enabled).forEach(o => bootTab(browser, o))
        displayWelcome(ids.filter(o => o.enabled).length)
    } catch (e) {
        output(e)
        output('Fatal error occured, restarting bot')
        runAmabot()
    }
}
const attemptFallback = async (page, listing) => {
    try {
        output(`Attempting fallback checkout for ${listing.name}`)
        if (!listing.ASIN) {
            output(`${listing.name} does not have ASIN, fallback checkout not available`)
        }
        await page.bringToFront()
        await goToPage(page, `https://smile.amazon.com/dp/${listing.ASIN}`)
        await page.waitForSelector('#buy-now-button', { timeout: 3000 })
        await page.click('#buy-now-button')
        await page.bringToFront()
        try {
            await page.waitForSelector('iframe#turbo-checkout-iframe')
            const checkoutModel = await page.$('iframe#turbo-checkout-iframe')
            const frame = await checkoutModel.contentFrame()
            await frame.waitForSelector('#turbo-checkout-pyo-button')
            output(`Attempting turbo purchase for ${listing.name}`)
            if (testMode) {
                return true
            }
            await frame.click('#turbo-checkout-pyo-button')
            await page.waitForNavigation()
            await page.waitForSelector('#widget-purchaseSummary', { timeout: 2000 })
            await page.screenshot({ path: `screenshots/${scDate}_AFTER_PLACE_ORDER.png`, fullPage: true })
        } catch (e) {
            
            output(e)
            output(`Failed turbo for ${listing.name}`)
            return false
        }
        await page.waitForSelector('[name=placeYourOrder1]', { timeout: 6000 })
        await page.bringToFront()
        output(`Attempting fallback purchase for ${listing.name}`)
        if (testMode) {
            return true
        }
        await page.click('[name=placeYourOrder1]')
        await page.waitForNavigation()
        await page.waitForSelector('#widget-purchaseSummary', { timeout: 2000 })
        await page.screenshot({ path: `screenshots/${scDate}_AFTER_PLACE_ORDER.png`, fullPage: true })
    } catch (e) {
        output(e)
        output(`Failed fallback for ${listing.name}`)
        return false
    }
    return false
}
const bootTab = async (browser, listing) => {
    const page = await browser.newPage()
    await goToPage(page, `https://smile.amazon.com/gp/aws/cart/add-res.html?Quantity.1=1&OfferListingId.1=${listing.ID}`)
    var purchased = false
    var errorCount = 0;
    while (!purchased) {
        date = new moment().format('hh:mm:ss A')
        scDate = new moment().format('YYYY-MM-DD_hh-mm-ss');
        await page.setCacheEnabled(false)
        try {
            await page.bringToFront()
            var notAvailableError = await page.$('.a-color-error')
            if (notAvailableError) {
                errorCount = 0
                // Unavailable
                await sleep(400)
                try {
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 })
                } catch {
                    output(`time out occurred`)
                }
            } else {
                output(`Purchasing ${listing.name}`)
                await page.bringToFront()
                var continueBotton = await page.$('[type=submit]')
                if (continueBotton) {
                    await page.bringToFront()
                    await page.click('[type=submit]')
                    await page.waitForSelector('[name=proceedToRetailCheckout]', { timeout: 3000 })
                    await goToPage(page, `https://smile.amazon.com/gp/cart/desktop/go-to-checkout.html/ref=ox_sc_proceed?partialCheckoutCart=1&isToBeGiftWrappedBefore=0&proceedToRetailCheckout=Proceed+to+checkout&proceedToCheckout=1`)
                    await page.bringToFront()
                    await page.waitForSelector('[name=placeYourOrder1]', { timeout: 6000 })
                    var orderButton = await page.$('[name=placeYourOrder1]')
                    if (orderButton) {
                        output(`Place Order Button found for ${listing.name}`)
                        if (testMode) {
                            return
                        }
                        await page.click('[name=placeYourOrder1]')
                        await page.waitForNavigation()
                        await page.waitForSelector('#widget-purchaseSummary', { timeout: 2000 })
                        await page.screenshot({ path: `screenshots/${scDate}_AFTER_PLACE_ORDER.png`, fullPage: true })
                        var purchaseSummary = await page.$('#widget-purchaseSummary')
                        if (purchaseSummary) {
                            output(`Completed purchase for ${listing.name}`)
                            purchased = true
                            return
                        } else {
                            errorCount++
                            output(`Failed to purchase ${listing.name} after clicking place order`)
                        }
                    } else {
                        errorCount++
                        output(`No place order button found for ${listing.name}`)
                    }

                } else {
                    errorCount++
                    output(`No continue button found on offer page`)
                }
            }
        } catch (e) {
            if (await attemptFallback(page, listing)) {
                output(`Fallback successful for ${listing.name}`)
                return
            }
            output(e)
            output(`Error occurred, going back to original offer ID`)
            await goToPage(page, `https://smile.amazon.com/gp/aws/cart/add-res.html?Quantity.1=1&OfferListingId.1=${listing.ID}`)
        }
        if (errorCount > 0) {
            output(`Error Count larger than 0, going back to original offer ID`)
            await goToPage(page, `https://smile.amazon.com/gp/aws/cart/add-res.html?Quantity.1=1&OfferListingId.1=${listing.ID}`)
        }
    }
}
var args = process.argv.join(' ')
if (args.includes('headless')) {
    headlessRun = true
}
if (args.includes('verbose')) {
    verbose = true
}
if (args.includes('captcha')) {
    captchaChecking = true
}
if (args.includes('test')) {
    testMode = true
}
var fs = require('fs');
var dir = './screenshots';

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}
runAmabot()
