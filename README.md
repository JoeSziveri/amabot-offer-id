# Amabot
## Setup
- Set your `Buy it Now` default preferences on amazon
- Install Node.js and yarn
- Create a json file named `config.json` in the main directory
- Config example:
```
{
    "email": "email@gmail.com",
    "password": "hunter2"
}
```

Set Up Dependencies:
```
npm install
```

Start Bot:
```
yarn start [Amazon UPC Code] '[Offer ID]'
```

## Warning
Offer ID has price built into it, the bot will NOT check price before purchasing. Only use offer IDs from trusted sources
