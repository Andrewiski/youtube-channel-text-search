"use strict";
const appName = "ApiRequestHandler";
const extend = require('extend');
const http = require('http');
const https = require('https');
var MongoClient = require('mongodb').MongoClient;
var dayjs = require('dayjs');
//const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const { YoutubeTranscript } = require('youtube-transcript');

var ApiRequestHandler = function (options) {
    var self = this;
    var defaultOptions = {
        mongoDbServerUrl: "",
        mongoDbDatabaseName:"",
        mongoClientOptions: {useUnifiedTopology: true},
        logUtilHelper:null,
        googleApiKey: null
    };
    var objOptions = extend({}, defaultOptions, options);
    self.options = objOptions;

    var debug = null;
    if (self.options.logUtilHelper){
        debug = function(loglevel){
            let args = []
            for (let i = 0; i < arguments.length; i++) {
                if (arguments[i] === undefined) {
                    args.push("undefined")
                } else if (arguments[i] === null) {
                    args.push("null")
                }
                else {
                    args.push(JSON.parse(JSON.stringify(arguments[i])))
                }
            }
            if (args.length > 1) {
                args.shift(); //remove the loglevel from the array
            }
            self.options.logUtilHelper.log(appName, "app", loglevel, args);
        }
    }else{
        debug = require('debug')(appName);
    }

    var BindRoutes = function (routes) {
        try {
            //routes.get('/api/Settings/AnonymousClientSideSettings', getAnonymousClientSideSettings);
            routes.get('/api/searchTranscript', searchTranscripts);
        } catch (ex) {
           debug("error", ex.msg, ex.stack);
        }  
    }

    var getAnonymousClientSideSettings = function(req, res, next){
        try {
            
            var clientSideSettings = {
                googleApiKey: self.options.googleApiKey
            }
            
            
            res.json(clientSideSettings);
            
            
        } catch (ex) {
            debug("error", "getUserInfo", { "msg": ex.message, "stack": ex.stack });
            res.status(500).json({ "msg": "An Error Occured!", "error": ex });
        }
    }

    var insertVideoTranscript = function (options){
        return new Promise((resolve, reject) => {        
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeTranscripts');
                        if (collection) {
                            var transcript = options.transcript;
                            transcript.createdOn = new Date();
                            collection.insertOne(transcript).then(                            
                                function ( doc) {
                                    client.close();
                                    resolve(accessToken);
                                },
                                function(err){
                                    debug("error", "insertVideoTranscript", { "msg": err.message, "stack": err.stack });
                                    reject({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            debug("error", "insertVideoTranscript", { "msg": "Not Able to Open MongoDB Connection", "stack": "" });
                            client.close();
                            reject({ "code": 500, "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                        }
                    } catch (ex) {
                        debug("error", "insertVideoTranscript", { "msg": ex.message, "stack": ex.stack });
                        client.close();
                        reject({ "code": 500, "msg": ex.message, "error": ex });
                    }
                },
                function(err){
                    debug("error", "insertVideoTranscript", { "msg": err.message, "stack": err.stack });
                    reject({ "msg": "An Error Occured!", "error": err });           
                }
            )
            })
            .catch ((ex) => {
                debug('error', 'insertVideoTranscript',  { "msg": ex.message, "stack": ex.stack });
            });
    }


    var remoteDownloader = function (options) {
        return new Promise((resolve, reject) => {
            if (options.url.startsWith('http://') === true) {
                protocol = http;
            }
            else {
                protocol = https;
            }

            if (!options.url) {
                debug("warning", "remoteDownloader", "No url to download");
                reject({ "code": 500, "msg": "An Error Occured!", "error": new Error('No url to download') }); 
            }
            var protocol;
            var opc = {};
            try {

                if (options.cert && options.cert !== '') {
                    opc.cert = fs.readFileSync(path.join(__dirname, options.cert));
                } 
                if (opc.key && opc.key !== '') {
                    opc.key = fs.readFileSync(path.join(__dirname, options.key));
                } 
            } catch (ex) {
                debug('error', 'remoteDownloader', ' error downloading data ', ex);
                if (opc.key) {
                    delete opc.key;
                }
                if (opc.cert) {
                    delete opc.cert;
                }
            }
            if (options.rejectUnauthorized !== undefined) {
                opc.rejectUnauthorized = options.rejectUnauthorized
            }
            opc.followAllRedirects = true;
            if (options.method) {
                opc.method = options.method;
            }else {
                opc.method = "GET";
            
            }
            var request = protocol.request(options.url, opc, function (res) {

                var data = '';
                var retval = null;
                res.on('data', function (d) {
                    data = data + d;
                });

                res.on('end', function () {
                    var error = null;
                    try {
                        if (res.statusCode === 200) {
                            retval = JSON.parse(data); 
                            if (options.injectCookies) {
                                retval.cookies = res.cookies;
                            }
                            if (options.injectHeaders) {
                                retval.headers = res.headers;
                            }
                            resolve(retval);
                        }else if (res.statusCode === 401) {
                            retval = JSON.parse(data);
                            if(retval.message){
                                retval.msg = retval.message + " " + "NMS Auth Token may be expired!";
                            }else{
                                retval.msg = "NMS Auth Token may be expired!";
                            }
                            //retval.code = retval.statusCode;
                            retval.msg = retval.message + " " + "NMS Auth Token may also be expired!";
                            reject(retval);
                        }else if (res.statusCode === 404) {
                            retval = JSON.parse(data);
                            if(retval.message){
                                retval.msg = retval.message + " " + "URL Not Found!";
                            }else{
                                retval.msg = "URL Not Found!";
                            }
                            
                            reject(retval);
                        } else {
                            debug('warning', 'remoteDownloader', 'Error downloading the remote JSON', 'download.error', data);
                            try {
                                retval = JSON.parse(data); 
                                if (retval.message | retval.message === "") {
                                    retval.msg = retval.message;
                                    delete retval.message;
                                }
                                if (retval.msg === undefined || retval.msg === "") {
                                    retval.msg = "An Error Occured!";
                                }
                            } catch (ex) {
                                debug('error', 'remoteDownloader',  {msg:ex.message, stack:ex.stack});
                                retval = { "code": 500, "msg": "An Error Occured!", "error": e };
                            }
                            reject(retval);
                        }
                    } catch (e) {
                        debug('error', 'remoteDownloader', 'Error reading the downloaded JSON:', 'download.error', {
                            e: e,
                            response: data,
                            url: options.url
                        });
                        reject({"code": 500, "msg": "An Error Occured!", "error": e }); 
                       
                    }
                    
                });

            });

            request.on('error', function (e) {
                debug('error', 'remoteDownloader', 'Error downloading the remote JSON', 'download.error',e);
                reject({ "code": 500, "msg": "An Error Occured!", "error": e }); 
            });
            if (options.headers) {
                for (let [key, value] of Object.entries(options.headers)) {
                    request.setHeader(key, value);
                }               
            } 
            let body = null;
            if (options.data) {
                if (typeof (options.data) === "object") {
                    body = JSON.stringify(options.data);
                } else {
                    body = options.data;
                }
            }
            request.end(body);
        })
        .catch ((ex) => {
            debug('error', 'remoteDownloader',  {msg:ex.message, stack:ex.stack});
        });
        
    };

    var youtubeSearchVideos = function (options) {
        return new Promise((resolve, reject) => {
            let filter = "";
            if(options.publishedAfter){
                let publishedAfter = dayjs(options.publishedAfter).add(1, 'second');
                filter = "&publishedAfter=" + publishedAfter.format("YYYY-MM-DDTHH:mm:ssZ");
            }
            if(options.nextPageToken){
                filter = filter + "&pageToken=" + options.nextPageToken;
            }
            let httpOptions = {
                url: "https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=" + options.channelId + filter +  "&maxResults=50&order=date&type=video&key=" + self.options.googleApiKey,
                headers : {'Content-Type': 'application/json' }
            }
            let channelVideos = [];
            remoteDownloader(httpOptions).then((results) => {
                if(results.items){
                    results.items.forEach((item,index) => {
                        let video = extend({}, item.snippet);
                        video.kind = item.id.kind;
                        video.videoId = item.id.videoId;
                        video.etag = item.etag;
                        channelVideos.push(video);
                    });
                }
                if(results.nextPageToken){
                    options.nextPageToken = results.nextPageToken;
                    youtubeSearchVideos(options).then((videos) => {
                        channelVideos = channelVideos.concat(videos);
                        resolve(channelVideos);
                    });
                }else{
                    resolve(channelVideos);
                }
            }).catch((ex) => {
                debug('error', 'youtubeSearchVideos',  {msg:ex.message, stack:ex.stack});
            });
        })
        .catch ((ex) => {
            debug('error', 'youtubeSearchVideos',  {msg:ex.message, stack:ex.stack});
        });
    }

    var test = function (options) {
        YoutubeTranscript.fetchTranscript(options.videoId)
            .then((transcripts) => {
                
                debug('info', 'fetchTranscript',  transcripts);
            })
            .catch((err) => {

                debug('error', 'fetchTranscript',  {msg:err.message, stack:err.stack});
            });
    }

    var LoadChannel = function (options) {
        //Load the List of Videos for the Channel
        //https://developers.google.com/youtube/v3/docs/search/list

        //https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=[ChannelID]&type=video&key=[YOUR_API_KEY]

        findLastPublishedVideo(options).then((lastPublishedVideo) => {
            if(lastPublishedVideo && lastPublishedVideo.publishedAt){
                options.publishedAfter = lastPublishedVideo.publishedAt;
            }
            youtubeSearchVideos(options).then((videos) => {
                videos.forEach((video) => {
                    upsertVideo({video:video}).then(
                        (upsertedVideo) => {
                            debug('info', 'LoadChannel',  {msg:"Upserted Video", video:upsertedVideo});
                        }
                    );
                    
                    
                });
            }).catch((ex) => {
                debug('error', 'LoadChannel',  {msg:ex.message, stack:ex.stack});
            });

        })

        

    }

    var getLatestChannelVideoData = function (options) {
        // YoutubeTranscript.fetchTranscript(video.videoId)
        // .then((transcripts) => {
        //     video.transcripts = transcripts;
            
        // })
        // .catch((err) => {

        //     debug('error', 'fetchTranscript',  {msg:err.message, stack:err.stack});
        // });
    }

    var findLastPublishedVideo = function (options) {
        let findOptions = {
            find: { channelId: options.channelId },
            sort: { publishedAt: -1 }
        };
        return findVideo(findOptions);
    }
        
    var searchTranscripts = function (req, res) {
        let options = {
            find: { status: "pending" }
        };
        findTranscripts(req, res, options);
    }

    var upsertVideo = function(options){
        return new Promise((resolve, reject) => {        
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeVideos');
                        if (collection) {
                            let query = { videoId: options.video.videoId };
                            collection.updateOne(query, {$set: options.video }, { upsert: true }).then(                            
                                function (result) {
                                    client.close();
                                    resolve(result);
                                },
                                function(err){
                                    debug("error", "upsertVideo", { "msg": err.message, "stack": err.stack });
                                    reject({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            debug("error", "upsertVideo", { "msg": "Not Able to Open MongoDB Connection", "stack": "" });
                            client.close();
                            reject({ "code": 500, "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                        }
                    } catch (ex) {
                        debug("error", "upsertVideo", { "msg": ex.message, "stack": ex.stack });
                        client.close();
                        reject({ "code": 500, "msg": ex.message, "error": ex });
                    }
                },
                function(err){
                    debug("error", "upsertVideo", { "msg": err.message, "stack": err.stack });
                    reject({ "msg": "An Error Occured!", "error": err });           
                }
            )
            })
            .catch ((ex) => {
                debug('error', 'upsertVideo',  { "msg": ex.message, "stack": ex.stack });
            });
    }

    var findVideo = function (options) {
        return new Promise((resolve, reject) => {
            let findDefaults = { }
            
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeVideos');
                        let findQuery = extend({}, options.find, findDefaults);
                        let sort = extend({}, options.sort);
                        var projections = { videoId: 1, etag: 1, publishTime: 1, title:1, publishedAt: 1, channelId: 1, description: 1, thumbnails: 1, channelTitle: 1};
                        if (collection) {
                            collection.findOne(findQuery, { sort: sort, projection: projections }).then(
                                function (doc) {
                                    client.close();
                                    resolve(doc);
                                },
                                function(err){
                                    debug("error", "findVideo", { "msg": err.message, "stack": err.stack });
                                    reject({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            return null;
                        }
                    } catch (ex) {
                        debug("error", "findVideo", { "msg": ex.message, "stack": ex.stack });
                        reject({ "msg": "An Error Occured!", "error": ex });
                        client.close();
                    }
                },
                function(err){
                    debug("error", "findVideo", { "msg": err.message, "stack": err.stack });
                    reject({ "msg": "An Error Occured!", "error": err });        
                }
            );
        }).catch ((ex) => {
            debug("error", "findVideo", { "msg": ex.message, "stack": ex.stack });
            
        })
    };

    var findVideos = function (req, res, options) {
        try {
            let findDefaults = { }
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeVideos');
                        var findQuery = extend({}, options.find, findDefaults);
                        var projections = { videoId: 1, etag: 1, publishTime: 1, title:1, publishedAt: 1, channelId: 1, description: 1, thumbnails: 1, channelTitle: 1};
                        if (collection) {
                            collection.find(findQuery, { projection: projections }).then(
                                function (docs) {
                                    res.json(docs);
                                    client.close();
                                },
                                function(err){
                                    debug("error", "findVideos", { "msg": err.message, "stack": err.stack });
                                    res.status(500).json({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            return null;
                        }
                    } catch (ex) {
                        debug("error", "findVideos", { "msg": ex.message, "stack": ex.stack });
                        res.status(500).json({ "msg": "An Error Occured!", "error": ex });
                        client.close();
                    }
                },
                function(err){
                    debug("error", "findVideos", { "msg": err.message, "stack": err.stack });
                    res.status(500).json({ "msg": "An Error Occured!", "error": err });        
                }
            );
        } catch (ex) {
            debug("error", "findVideos", { "msg": ex.message, "stack": ex.stack });
            res.status(500).json({ "msg": "An Error Occured!", "error": ex });
        }
    };

    var findTranscripts = function (req, res, options) {
        try {
            let findDefaults = { deleted: false }
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeTranscripts');
                        var findQuery = extend({}, options.find, findDefaults);
                        var projections = { routeGuid: 1, routeUserGuid: 1, status: 1, isTestData:1, startLocation: 1, destinationLocation: 1, createdOn: 1, earliestDeparture: 1,  shipments: 1 };
                        if (collection) {
                            collection.findOne(findQuery, { projection: projections }).then(
                                function (docs) {
                                    res.json(docs);
                                    client.close();
                                },
                                function(err){
                                    debug("error", "findTranscripts", { "msg": err.message, "stack": err.stack });
                                    res.status(500).json({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            return null;
                        }
                    } catch (ex) {
                        debug("error", "findTranscripts", { "msg": ex.message, "stack": ex.stack });
                        res.status(500).json({ "msg": "An Error Occured!", "error": ex });
                        client.close();
                    }
                },
                function(err){
                    debug("error", "findTranscripts", { "msg": err.message, "stack": err.stack });
                    res.status(500).json({ "msg": "An Error Occured!", "error": err });        
                }
            );
        } catch (ex) {
            debug("error", "findTranscripts", { "msg": ex.message, "stack": ex.stack });
            res.status(500).json({ "msg": "An Error Occured!", "error": ex });
        }
    };
    self.bindRoutes = BindRoutes;
    self.loadChannel = LoadChannel;
    self.test = test;
};
module.exports = ApiRequestHandler;