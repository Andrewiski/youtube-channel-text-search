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
            routes.get('/api/searchTranscripts', searchTranscriptsHandler);
        } catch (ex) {
           debug("error", ex.msg, ex.stack);
        }  
    }

    var searchTranscriptsHandler = function(req, res, next){
        let search = req.query.search;
        let options = {
            search: search
        }
        searchTranscripts(options).then((results) => {
            res.json(results);
        }).catch((ex) => {
            debug('error', 'searchTranscriptsHandler',  {msg:ex.message, stack:ex.stack});
            res.status(500).json({ "msg": "An Error Occured!", "error": ex });
        });
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

    var insertVideoTranscripts = function (options){
        return new Promise((resolve, reject) => {        
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeTranscripts');
                        if (collection) {
                            const insertOptions = { ordered: true };
                            collection.insertMany(options.transcripts, insertOptions).then(                            
                                function (results) {
                                    client.close();
                                    resolve(results);
                                },
                                function(err){
                                    debug("error", "insertVideoTranscripts", { "msg": err.message, "stack": err.stack });
                                    reject({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            debug("error", "insertVideoTranscripts", { "msg": "Not Able to Open MongoDB Connection", "stack": "" });
                            client.close();
                            reject({ "code": 500, "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                        }
                    } catch (ex) {
                        debug("error", "insertVideoTranscripts", { "msg": ex.message, "stack": ex.stack });
                        client.close();
                        reject({ "code": 500, "msg": ex.message, "error": ex });
                    }
                },
                function(err){
                    debug("error", "insertVideoTranscripts", { "msg": err.message, "stack": err.stack });
                    reject({ "msg": "An Error Occured!", "error": err });           
                }
            )
            })
            .catch ((ex) => {
                debug('error', 'insertVideoTranscripts',  { "msg": ex.message, "stack": ex.stack });
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
                                debug('error', 'remoteDownloader',  {message:ex.message, stack:ex.stack});
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
            debug('error', 'remoteDownloader',  {message:ex.message, stack:ex.stack});
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
                debug('error', 'youtubeSearchVideos',  {message:ex.message, stack:ex.stack});
            });
        })
        .catch ((ex) => {
            debug('error', 'youtubeSearchVideos',  {message:ex.message, stack:ex.stack});
        });
    }

    var youtubeGetVideoTranscripts = function (options) {
        return new Promise((resolve, reject) => {
            YoutubeTranscript.fetchTranscript(options.videoId)
                .then((transcripts) => {
                    let video = {videoId:options.videoId, hasTranscripts:false, transcriptCount: 0};
                    upsertVideo({video:video, upsert:false}).then(
                        (upsertResult) => {
                            debug('info', 'youtubeGetVideoTranscripts',  {message:"Updated Video", video:upsertResult});
                            deleteVideoTranscripts({videoId:options.videoId}).then((deleteResults) => {
                                debug('info', 'deleted Existing Transcripts', deleteResults);
                                transcripts.forEach((transcript, index) => {
                                    let nearText = "";
                                    if(index > 0){
                                        nearText = transcripts[index-1].text + " ";
                                    }
                                    nearText = nearText + transcript.text;
                                    if(index < transcripts.length - 1){ 
                                        nearText = nearText + " " + transcripts[index+1].text;
                                    }
                                    transcript.index = index;
                                    transcript.videoId = options.videoId;
                                    transcript.createdOn = new Date();
                                    transcript.nearText = nearText;
                                });
                                insertVideoTranscripts({transcripts:transcripts}).then((insertResults) => {
                                    let insertCount = 0;
                                    if(insertResults){
                                        insertCount = insertResults.insertedCount
                                    }
                                    debug('info', 'inserted Transcripts', insertCount );
                                    video.hasTranscripts = true;
                                    video.transcriptCount = insertCount;
                                    upsertVideo({video:video, upsert:false}).then(
                                        (upsertResult) => {
                                            resolve({message:"Inserted Transcripts", videoId:video.videoId, success:true, count:insertCount});        
                                        });
                                    
                                });
                            });
                        }
                    );
                    
                    
            })
            .catch((err) => {
                debug('error', 'youtubeGetVideoTransctipts',  {message:err.message, stack:err.stack});
                reject(err);
            });
        })
    }
    var loadVideoTranscripts = function (options) {
        return new Promise((resolve, reject) => {
            youtubeGetVideoTranscripts(options)
            .then((result) => {
                debug('info', 'loadVideoTranscripts',  {message:result});
                resolve(result);
            })
            .catch((err) => {
                debug('error', 'youtubeGetVideoTransctipts',  {message:err.message, stack:err.stack});
                reject(err);
            });
        })
       
    }
    var test = function (options) {
        return new Promise((resolve, reject) => {
            LoadMissingTranscripts(options)
                .then((result) => {
                    debug('info', 'test',  {msg:result});
                    resolve(result);
                })
                .catch((err) => {
                    debug('error', 'test',  {msg:err.msg, stack:err.stack});
                    reject({msg:err.msg, stack:err.stack});
                });
            })
            .catch((err) => {
                debug('error', 'test',  {msg:err.msg, stack:err.stack});
            });
    }

    var LoadChannel = function (options) {
        //Load the List of Videos for the Channel
        //https://developers.google.com/youtube/v3/docs/search/list

        //https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=[ChannelID]&type=video&key=[YOUR_API_KEY]
        return new Promise((resolve, reject) => {

            findLastPublishedVideo(options).then((lastPublishedVideo) => {
                if(lastPublishedVideo && lastPublishedVideo.publishedAt){
                    options.publishedAfter = lastPublishedVideo.publishedAt;
                }
                youtubeSearchVideos(options).then((videos) => {
                    videos.forEach((video) => {
                        video.hasTranscripts = false;
                        video.transcriptCount = 0;
                        upsertVideo({video:video}).then(
                            (upsertedVideo) => {
                                debug('info', 'LoadChannel',  {msg:"Upserted Video", video:upsertedVideo});
                                loadVideoTranscripts({videoId:video.videoId}).then((transcriptResults) => {
                                    debug('info', 'LoadChannel',  {msg:"Loaded Transcripts", videoId:video.videoId, success:true, count:transcriptResults.count});
                                }).catch((ex) => {
                                    debug('error', 'LoadChannel',  {msg:ex.msg, stack:ex.stack});
                                });
                            }
                        );  
                    });
                    resolve(videos);
                }).catch((ex) => {
                    debug('error', 'LoadChannel',  {msg:ex.msg, stack:ex.stack});
                });

            })
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
        
    var searchTranscripts = function (options) {
        return new Promise((resolve, reject) => { 
        let searchOptions = {
            find: { $text: {$search: options.search }}
        };
        findTranscripts(searchOptions).then((transcripts) => {
            let videoResults = {};
            let videoIds = [];
            let videoId = "";
            transcripts.forEach((transcript) => {
                if(videoResults[transcript.videoId] === undefined){
                    videoResults[transcript.videoId] = {
                        videoId: transcript.videoId,
                        transcripts: []
                    };
                }
                videoResults[transcript.videoId].transcripts.push(transcript);
                if(videoId !== transcript.videoId){
                    videoId = transcript.videoId;
                    videoIds.push(videoId);
                }
            });
            findVideos( {find: {videoId: {$in: videoIds}}}).then((videos) => {
                videos.forEach((video) => {
                        videoResults[video.videoId].video = video;
                });
                resolve(videoResults);
            });
        });
        }).catch ((ex) => {
            debug('error', 'searchTranscripts',  {msg:ex.message, stack:ex.stack});
        });
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
                            let updateOptions = { upsert: true };
                            if(options.upsert === false){
                                updateOptions.upsert = false ;
                            }
                            collection.updateOne(query, {$set: options.video }, updateOptions).then(                            
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
                            reject({ "msg": "Not Able to Open MongoDB Connection", "error": "collection is null"});
                        }
                    } catch (ex) {
                        debug("error", "upsertVideo", { "msg": ex.message, "stack": ex.stack });
                        client.close();
                        reject({ "msg": ex.message, "error": ex });
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


    var LoadMissingTranscripts = function(options){
        return new Promise((resolve, reject) => {
            let findOptions = {
                find: { hasTranscripts: false }
            };
            findVideos(findOptions).then((videos) => {
                videos.forEach((video) => {
                    loadVideoTranscripts({videoId:video.videoId}).then((transcriptResults) => {
                        debug('info', 'LoadChannel',  {msg:"Loaded Transcripts", videoId:video.videoId, success:true, count:transcriptResults.count});
                    }).catch((ex) => {
                        debug('error', 'LoadChannel',  {msg:ex.msg, stack:ex.stack});
                    });
                });
                resolve(videos);
            });
        })
    }

    var searchVideos = function (options) {
        return findVideos(options);
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
                        var projections = { videoId: 1, etag: 1, publishTime: 1, title:1, publishedAt: 1, channelId: 1, description: 1, thumbnails: 1, channelTitle: 1, hasTranscripts: 1, transcriptCount: 1};
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

    var findVideos = function (options) {
        return new Promise((resolve, reject) => {
            
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeVideos');
                        let findDefaults = {}
                        let sortDefaults = { publishTime: -1 };
                        let projectionDefaults = { videoId: 1, etag: 1, publishTime: 1, title:1, publishedAt: 1, channelId: 1, description: 1, thumbnails: 1, channelTitle: 1, hasTranscripts: 1, transcriptCount:1};
                        var findQuery = extend({}, options.find, findDefaults);
                        var sort = extend({}, options.sort, sortDefaults);
                        var projections = extend({}, options.projections, projectionDefaults);
                        if (collection) {
                            collection.find(findQuery)
                            .project(projections)
                            .sort(sort)
                            .toArray()
                            .then(
                                function (docs) {
                                    client.close();
                                    resolve(docs);
                                },
                                function(err){
                                    debug("error", "findVideos", { "msg": err.message, "stack": err.stack });
                                    reject({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            debug("error", "findVideos", { "msg": "Colection Not Found", "stack": ""});
                            reject({ "msg": "Colection Not Found", "stack": ""});;
                        }
                    } catch (ex) {
                        debug("error", "findVideos", { "msg": ex.message, "stack": ex.stack });
                        reject({ "msg": "An Error Occured!", "error": ex });
                        client.close();
                    }
                },
                function(err){
                    debug("error", "findVideos", { "msg": err.message, "stack": err.stack });
                    reject({ "msg": "An Error Occured!", "error": err });        
                }
            );
        }).catch((ex) => {
            debug("error", "findVideos", { "msg": ex.message, "stack": ex.stack });
        });
    };

    var findTranscripts = function (options) {
        return new Promise((resolve, reject) => {
            let findDefaults = {}
            let sortDefaults = { videoId: 1, index: 1 };
            let projectionDefaults = { videoId: 1, index: 1, text: 1, start: 1, duration: 1, offset: 1, nearText: 1, offsetSeconds: {$floor: {$divide: ["$offset", 1000] } } };
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeTranscripts');
                        var findQuery = extend({}, options.find, findDefaults);
                        var sort = extend({}, options.sort, sortDefaults);
                        var projections = extend({}, options.projections, projectionDefaults);
                        if (collection) {
                            collection.find(findQuery)
                            .project(projections)
                            .sort(sort)
                            .toArray()
                            .then(
                                function (docs) {
                                    client.close();
                                    resolve(docs);
                                },
                                function(err){
                                    debug("error", "findTranscripts", { "msg": err.message, "stack": err.stack });
                                    reject({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            return null;
                        }
                    } catch (ex) {
                        debug("error", "findTranscripts", { "msg": ex.message, "stack": ex.stack });
                        reject({ "msg": "An Error Occured!", "error": ex });
                        client.close();
                    }
                },
                function(err){
                    debug("error", "findTranscripts", { "msg": err.message, "stack": err.stack });
                    reject({ "msg": "An Error Occured!", "error": err });        
                }
            );
        }). catch ((ex) => {
            debug("error", "findTranscripts", { "msg": ex.message, "stack": ex.stack });
            
        });
    };

    var deleteVideoTranscripts = function (options) {
        return new Promise((resolve, reject) => {
            let findDefaults = { videoId: options.videoId }
            const client = new MongoClient(self.options.mongoDbServerUrl,self.options.mongoClientOptions);
            // Use connect method to connect to the Server
            client.connect().then(
                function (client) {
                    try {
                        const db = client.db(self.options.mongoDbDatabaseName);
                        const collection = db.collection('youtubeTranscripts');
                        var findQuery = extend({}, options.find, findDefaults);
                        if (collection) {
                            collection.deleteMany(findQuery).then(
                                function (results) {
                                    client.close();
                                    resolve(results);
                                },
                                function(err){
                                    debug("error", "findTranscripts", { "msg": err.message, "stack": err.stack });
                                    reject({ "msg": "An Error Occured!", "error": err });
                                    client.close();            
                                }
                            );
                        } else {
                            return null;
                        }
                    } catch (ex) {
                        debug("error", "findTranscripts", { "msg": ex.message, "stack": ex.stack });
                        reject({ "msg": "An Error Occured!", "error": ex });
                        client.close();
                    }
                },
                function(err){
                    debug("error", "findTranscripts", { "msg": err.message, "stack": err.stack });
                    reject({ "msg": "An Error Occured!", "error": err });        
                }
            );
        }). catch ((ex) => {
            debug("error", "findTranscripts", { "msg": ex.message, "stack": ex.stack });
            
        })
    };


    self.bindRoutes = BindRoutes;
    self.loadChannel = LoadChannel;
    self.searchTranscripts = searchTranscripts;
    self.searchVideos = searchVideos;
    self.test = test;
    self.loadVideoTranscripts = loadVideoTranscripts;
};
module.exports = ApiRequestHandler;