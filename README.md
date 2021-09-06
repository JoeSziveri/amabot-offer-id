# Amabot
## Setup
- Set your `Buy it Now` default preferences on amazon
- Install Node.js
- Create a json file named `config.json` in the main directory
- Config example:
```
{
    "email": "email@gmail.com",
    "password": "hunter2"
}
```

Set Up Dependencies after installing Node.js by running these 3 commands:
```
npm install
npm install --global yarn
yarn
```
Select which listings to run the bot on by setting "enabled" value in OfferIds.json to true. It is not reccommended to run the bot on more than 10 listings on a single IP. Use a residential proxy and a different account for every 10 listings. Exceeding 10 may risk getting your account soft banned. The bot can solve captchas if need be, but it will slow it down.

Start Bot:
```
yarn start --headless

--headless will run bot without opening chromium window. Better on CPU but you cannot see what is happening with your own eyes.
--verbose will output more detailed console outputs.

```

## Warning
Offer ID has price built into it, the bot will NOT check price before purchasing. Only use offer IDs from trusted sources.


You can learn how to get Offer IDs here: https://www.youtube.com/watch?v=GBHHwAEUxp4&ab_channel=ZeroRiskFlips
