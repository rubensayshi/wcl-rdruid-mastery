var http = require('http');
var httpProxy = require('http-proxy');

var proxy = httpProxy.createProxyServer();

proxy.on('proxyRes', function (proxyRes, req, res) {
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
});

//
// Create your server that makes an operation that waits a while
// and then proxies the request
//
http.createServer(function (req, res) {
    proxy.web(req, res, {
        secure: false,
        changeOrigin: true,
        target: 'https://www.warcraftlogs.com'
    });
}).listen(8000);
