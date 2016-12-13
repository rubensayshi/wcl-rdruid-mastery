Resto Shaman Mastery Analyzer
============================
This is a small script to analyze a fight (using warcraftlogs.com API) to show how much each stat point contributed to each heal on average.

Install
-------
```
npm install
```

How to use
----------
Get your APIKEY from warcraftlogs.com and set it to an ENVVAR:
```bash
export WCL_RSHAMAN_APIKEY=""  # set your APIKEY in this
```

List the fights in your report, ofc replace the reportID and Character name with your own:
```bash
node shamanalysis.js --report PB1GX6fwdLAR8vYN --character Sharambane ls
```

Parse a fight by putting the fightID as last argument:
```bash
node shamanalysis.js --report PB1GX6fwdLAR8vYN --character Sharambane 16
```

Browserify version
------------------
NYI
