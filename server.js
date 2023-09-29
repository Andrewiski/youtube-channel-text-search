'use strict';
const appLogName = "youtubesearch"
const http = require('http');
const path = require('path');
const extend = require('extend');
const express = require('express');
const favicon = require('serve-favicon');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const packagejson = require('./package.json');
const version = packagejson.version;
const ConfigHandler = require("@andrewiski/confighandler");
const LogUtilHelper = require("@andrewiski/logutilhelper");
const ioServer = require('socket.io');
const ApiRequestHandler = require("./ApiRequestHandler.js");
const { Router } = require('express');
const { networkInterfaces } = require('os');

var configFileOptions = {
    "configDirectory": "config",
    "configFileName": "config.json"
}


var localDebug = false;
if (process.env.localDebug === 'true') {
    console.log("localDebug is enabled")
    configFileOptions.configDirectory = "config/localDebug";
    localDebug = true;
}
var consoleLog = function () {
    if(localDebug === true){
        console.log.apply(this, arguments);
    }
}

var defaultConfig = {
    "configDirectory": configFileOptions.configDirectory,
    "mongoDbServerUrl": "mongodb://youtubesearch:y0utube3earch@youtubesearch_mongodb:27017/",
    "mongoDbDatabaseName": "youtubesearch",
    "logDirectory": "logs",
    "logLevel": "info",
    "httpport": 37080,
    "googleApiKey":"",
    "appLogLevels":{
        "youtubesearch": {
            "app":"info",
            "browser":"info"
        },
        "apiRequestHandler":{"app":"info"}
    }
};

// if Environment Varables are passed in then override the defaults which will be written to the initial config file
try{
    let envVarablesSet = false;
    let envHTTPPORT = process.env.HTTPPORT ;
    if (envHTTPPORT){
        consoleLog ("environment HTTPPORT = " + envHTTPPORT )
        defaultConfig.httpport = parseInt(envHTTPPORT);
        envVarablesSet = true;
    }
    let envCONFIGDIRECTORY = process.env.CONFIGDIRECTORY ;
    if (envCONFIGDIRECTORY){
        consoleLog ("environment CONFIGDIRECTORY = " + envCONFIGDIRECTORY )
        defaultConfig.configDirectory = envCONFIGDIRECTORY;
        envVarablesSet = true;
    }
    let envMONGODBSERVERURL = process.env.MONGODBSERVERURL ;
    if (envMONGODBSERVERURL){
        consoleLog ("environment MONGODBSERVERURL = " + envMONGODBSERVERURL )
        defaultConfig.mongoDbServerUrl = envMONGODBSERVERURL;
        envVarablesSet = true;
    }
    let envMONGODBDATABASENAME = process.env.MONGODBDATABASENAME ;
    if (envMONGODBDATABASENAME){
        consoleLog ("environment MONGODBDATABASENAME = " + envMONGODBDATABASENAME )
        defaultConfig.mongoDbDatabaseName = envMONGODBDATABASENAME;
        envVarablesSet = true;
    }
    let envGOOGLEAPIKEY = process.env.GOOGLEAPIKEY ;
    if (envGOOGLEAPIKEY){
        consoleLog ("environment GOOGLEAPIKEY = " + envGOOGLEAPIKEY )
        defaultConfig.googleApiKey = envGOOGLEAPIKEY;
        envVarablesSet = true;
    }

    if(envVarablesSet === true){
        consoleLog("Environment Varables set this only effects the initial creation of the config file")
    }
}catch(err){
    consoleLog("error Reading Environment Variables" + err)
}

var configHandler = new ConfigHandler(configFileOptions, defaultConfig);

var objOptions = configHandler.config;
var configFolder = objOptions.configDirectory;


var privateData = {
    browserSockets: {}
};


var appLogHandler = function (logData) {
    //send Log to subscribed browser sockets
    try{
        for (var socketId in privateData.browserSockets) {
            try{
                if(privateData.browserSockets[socketId].logsSubscribe === true){
                    //var shouldLogAppLogLevels = function (appLogLevels, appName, appSubname, logLevelName) {
                    //if(logUtilHelper.shouldLogAppLogLevels(privateData.browserSockets[socketId].logLevel, logData.appName, logData.appSubname, logData.level) === true){
                    if(logUtilHelper.shouldLogAppLogLevels(privateData.browserSockets[socketId].logLevels, logData.appName, logData.appSubname, logData.level) === true){
                        var socket = privateData.browserSockets[socketId].socket;
                        socket.emit('serverLog', logData);
                    }
                }
            }catch(ex){
                consoleLog("Error sending log to browser socket", socketId , ex);
            }
        }
    }catch(ex){
        consoleLog("Error sending log to browser sockets", ex);
    }
}

let logUtilHelper = new LogUtilHelper({
    appLogLevels: objOptions.appLogLevels,
    logEventHandler: null,
    logUnfilteredEventHandler: appLogHandler,
    logFolder: objOptions.logDirectory,
    logName: appLogName,
    debugUtilEnabled: (process.env.DEBUG ? true : undefined) || false,
    debugUtilName:appLogName,
    debugUtilUseAppName:true,
    debugUtilUseUtilName:false,
    debugUtilUseAppSubName:false,
    logToFile: !localDebug,
    logToFileLogLevel: objOptions.logLevel,
    logToMemoryObject: true,
    logToMemoryObjectMaxLogLength: objOptions.maxLogLength,
    logSocketConnectionName: "socketIo",
    logRequestsName: "access"

})


var loadVideosEventHandler = function (eventData) {
    if(io){
        io.emit('loadVideosProgress', eventData)
    }
}


var apiRequestHandler = new ApiRequestHandler({
    mongoDbServerUrl: objOptions.mongoDbServerUrl,
    mongoDbDatabaseName: objOptions.mongoDbDatabaseName,
    logUtilHelper:logUtilHelper,
    googleApiKey:objOptions.googleApiKey,
    loadVideosEventHandler:loadVideosEventHandler
});



var app = express();

var commonData = {
    startupStats: {
        startupDate: new Date(),
        nodeVersion: process.version,
        nodeVersions: process.versions,
        platform: process.platform,
        arch: process.arch  
    }
};





var getConnectionInfo = function (req) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (ip.substr(0, 7) === "::ffff:") {
        ip = ip.substr(7);
    }
    var port = req.connection.remotePort;
    var ua = req.headers['user-agent'];
    return { ip: ip, port: port, ua: ua };
};

var getSocketInfo = function (socket) {
    var ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress;
    if (ip.substr && ip.substr(0, 7) === "::ffff:") {
        ip = ip.substr(7);
    }

    return { ip: ip };
};

//config public files are used before public folder files to allow overwrite.

if(fs.existsSync(path.join(__dirname, objOptions.configDirectory, 'public'))){
    app.use(express.static(path.join(__dirname, objOptions.configDirectory, 'public')));
}

app.use(express.static(path.join(__dirname, 'public')));


// disable the x-power-by express message in the header
app.disable('x-powered-by');



if (fs.existsSync(path.join(__dirname, 'logs')) === false) {
    fs.mkdirSync(path.join(__dirname, 'logs'));
}

//This function will get called on every request and if useHttpsClientCertAuth is turned on only allow request with a client cert
app.use(function (req, res, next) {
    var connInfo = getConnectionInfo(req);
    logUtilHelper.log(appLogName, "browser", 'debug',  "path:" + req.path + ", ip:" + connInfo.ip + ", port:" + connInfo.port + ", ua:" + connInfo.ua);
    next();
    return;
})

// not needed already served up by io app.use('/javascript/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'node_modules', 'socket.io-client', 'dist')));
app.use('/javascript/fontawesome', express.static(path.join(__dirname, 'node_modules', '@fortawesome', 'fontawesome-free')));
app.use('/javascript/popper', express.static(path.join(__dirname, 'node_modules', '@popperjs', 'core', 'dist')));
app.use('/javascript/bootstrap', express.static(path.join(__dirname, 'node_modules', 'bootstrap', 'dist')));
app.use('/javascript/dayjs', express.static(path.join(__dirname, 'node_modules', 'dayjs')));
app.use('/javascript/bootstrap-notify', express.static(path.join(__dirname, 'node_modules', 'bootstrap-notify')));
app.use('/javascript/mustache', express.static(path.join(__dirname, 'node_modules', 'mustache')));
app.use('/javascript/js-cookie', express.static(path.join(__dirname, 'node_modules', 'js-cookie', 'dist')));
if(fs.existsSync(path.join(__dirname,configFolder, '/public/images', 'favicon.ico' ))){
    app.use(favicon(path.join(__dirname,configFolder, '/public/images', 'favicon.ico' )));
}else{
    if(fs.existsSync(path.join(__dirname, '/public/images', 'favicon.ico' ))){
        app.use(favicon(path.join(__dirname, '/public/images', 'favicon.ico' )));
    }
}
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

var routes = express.Router();


var handlePublicFileRequest = function (req, res) {
    var filePath = req.path;

    if (filePath === "/") {
        filePath = "/index.htm";
    }
    //console.log('handlePublicFileRequest ' + filePath + ' ...');

    //var extname = path.extname(filePath);
    //var contentType = 'text/html';
    //switch (extname) {
    //    case '.js':
    //        contentType = 'text/javascript';
    //        break;
    //    case '.css':
    //        contentType = 'text/css';
    //        break;
    //    case '.json':
    //        contentType = 'application/json';
    //        break;
    //    case '.png':
    //        contentType = 'image/png';
    //        break;
    //    case '.jpg':
    //        contentType = 'image/jpg';
    //        break;
    //    case '.wav':
    //        contentType = 'audio/wav';
    //        break;
    //    case ".ico":
    //        contentType = "image/x-icon";
    //        break;
    //    case ".zip":
    //        contentType = "application/x-zip";
    //        break;
    //    case ".gz":
    //        contentType = "application/x-gzip";
    //        break;

    //}

    if (fs.existsSync(path.join(__dirname, 'public',filePath)) === true) {
        res.sendFile(filePath, { root: path.join(__dirname, 'public') });  
    } else {
        filePath = "/index.htm";
        res.sendFile(filePath, { root: path.join(__dirname, 'public') });
        //res.sendStatus(404);
    }
    
} ;  

 

apiRequestHandler.bindRoutes(routes);


routes.get('/*', function (req, res) {
    handlePublicFileRequest(req, res);
});



app.use('/', routes);






var io = null;
io =  ioServer();
var http_srv = null;
var startWebServer = function () {

    

    
    try {
        http_srv = http.createServer(app).listen(objOptions.httpport, function () {
            logUtilHelper.log(appLogName, "app", 'info', 'Express server listening on http port ' + objOptions.httpport);
        });
        io.attach(http_srv);
    } catch (ex) {
        logUtilHelper.log(appLogName, "app", 'error', 'Failed to Start Express server on http port ' + objOptions.httpport, ex);
    }

    try{
        

        const nets = networkInterfaces();
        //const results = Object.create(null); // Or just '{}', an empty object
        
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                if (net.family === 'IPv4' && !net.internal) {
                    // if (!results[name]) {
                    //     results[name] = [];
                    // }
                    //results[name].push(net.address);
                    logUtilHelper.log(appLogName, "app","info", "interface", name, net.address)
                }
            }
        }
        //logUtilHelper.log(appLogName, "app","info", "interface ipv4 addresses", results)

    }catch (ex) {
        logUtilHelper.log(appLogName, "app",'error', 'Failed to Get Ip Infomation', ex);
    }
};


// This is the socket io connections coming from the Browser pages

//io = require('socket.io')(https_srv);
io.on('connection', function (socket) {


    logUtilHelper.log(appLogName, "browser", 'info',  socket.id, 'Connection', getSocketInfo(socket));

    if (privateData.browserSockets[socket.id] === undefined) {
        privateData.browserSockets[socket.id] = {
            socket: socket,
            logLevels: JSON.parse(JSON.stringify(objOptions.logLevel)),
            logsSubscribe: false
        };
    }

    socket.on('ping', function (data) {
        logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'ping');
    });

    socket.on('serverLogsSubscribe', function (data) {
        logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'serverLogsSubscribe');
        privateData.browserSockets[socket.id].logsSubscribe= true;
        
    });
    socket.on('serverLogsUnsubscribe', function (data) {
        logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'serverLogsUnsubscribe');
        privateData.browserSockets[socket.id].logsSubscribe= false;
        
    });
    socket.on('serverLogs', function (data) {
        logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'serverLogs');
        socket.emit('serverLogs', logUtilHelper.memoryData.logs);
    });
    socket.on('serverLogLevels', function (data) {
        logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'serverLogLevels', data);
        if (data === undefined || data === null || data === "") {
            socket.emit('serverLogLevels', privateData.browserSockets[socket.id].logLevels);
        }else{
            privateData.browserSockets[socket.id].logLevels = data;
        }
        
    });

    socket.on("disconnect", function () {
        try {
            logUtilHelper.log(appLogName, "browser", "info",  socket.id, "disconnect", getSocketInfo(socket));
            if (privateData.browserSockets[socket.id]) {
                delete privateData.browserSockets[socket.id];
            }
        } catch (ex) {
            logUtilHelper.log(appLogName, "browser", 'error', 'Error socket on', ex);
        }
    });
    socket.on("loadVideos", function (data) {
        try {
            logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'loadChannel', data);
            apiRequestHandler.loadVideos(data).then((results) => {
                socket.emit('loadVideosResults', results);
            });
        } catch (ex) {
            logUtilHelper.log(appLogName, "browser", 'error', 'Error socket on', ex);
        }
    });
    socket.on("test", function (data) {
        try {
            logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'test', data);
            apiRequestHandler.test(data).then((results) => {
                
                socket.emit('test', results);
                
            });
        } catch (ex) {
            logUtilHelper.log(appLogName, "browser", 'error', 'Error socket on', ex);
        }
    });

    socket.on("searchTranscripts", function (data) {
        try {
            logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'search', data);
            apiRequestHandler.searchTranscripts(data).then((results) => {
                socket.emit('searchTranscriptsResults', results);
            });
        } catch (ex) {
            logUtilHelper.log(appLogName, "browser", 'error', 'Error socket on', ex);
        }
    });

    socket.on("searchVideos", function (data) {
        try {
            logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'search', data);
            apiRequestHandler.searchVideos(data).then((results) => {
                socket.emit('searchVideosResults', results);
            });
        } catch (ex) {
            logUtilHelper.log(appLogName, "browser", 'error', 'Error socket on', ex);
        }
    });

    socket.on("loadVideoTranscripts", function (data) {
        try {
            logUtilHelper.log(appLogName, "browser", 'trace',  socket.id, 'loadVideoTranscripts', data);
            apiRequestHandler.loadVideoTranscripts(data).then((results) => {
                socket.emit('loadVideoTranscriptsResults', results);
            }).catch((err) => {
                socket.emit('loadVideoTranscriptsResults', {message:err.message, stack:err.stack, videoId:data.videoId, success:false, count:0});
            });
        } catch (ex) {
            logUtilHelper.log(appLogName, "browser", 'error', 'Error socket on', ex);
        }
    });

    //This is a new connection, so send info to commonData
    socket.emit('commonData', commonData);
    
    
});




try {
    startWebServer();
} catch (ex) {
    logUtilHelper.log(appLogName, "app", 'error', 'Error Starting Web Servers', ex);
}
