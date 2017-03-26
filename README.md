Resto Durid Mastery Analyzer
============================
This is a small script to analyze a fight (using warcraftlogs.com API) 
and track how much of the time you had multiple HoTs rolling on a target.

It does this by going through the `applybuff` and `removebuff` events;
 - 0s `applybuff` rejuv
   - `target.hots.push(rejuv)`
 - 3s `applybuff` rejuv_germ
   - `stacks[targets.hots.length] += 3s - 0s`
   - `target.hots.push(germ)`
 - 4s `applybuff` lifebloom
   - `stacks[targets.hots.length] += 4s - 3s`  
   - `target.hots.push(lifebloom)`
 - 10s `removebuff` rejuv
   - `stacks[targets.hots.length] += 10s - 4s`  
   - `target.hots.remove(rejuv)`

[![Build Status](https://travis-ci.org/rubensayshi/wcl-rdruid-mastery.png?branch=master)](https://travis-ci.org/rubensayshi/wcl-rdruid-mastery)

Example
-------
![Example](https://raw.githubusercontent.com/rubensayshi/wcl-rdruid-mastery/master/example.png "Example")


Install
-------
```
npm install
```

How to use
----------
Get your APIKEY from warcraftlogs.com and set it to an ENVVAR:
```bash
export WCL_RDRUID_APIKEY=""  # set your APIKEY in this
```

List the fights in your report, ofc replace the reportID and Character name with your own:
```bash
node rdruid-mastery.js --report Yghv28tK4NnWaJ9D --character Saikó ls
```

Parse a fight by putting the fightID as last argument:
```bash
node rdruid-mastery.js --report Yghv28tK4NnWaJ9D --character Saikó 26
```

Browserify version
------------------
To build the browser version:
```
gulp
```

Then to run it you need to setup the proxy to WCL because there's a CORS header missing on the wcl API.  
This just proxies requests to `http://localhost:8000` to `https://www.warcraftlogs.com`.
```
node proxy.js
```

And then serve the `web/www` folder so you can visit the page:
```
serve -p 3000 web/www
```

And now you can visit `http://localhost:3000`
