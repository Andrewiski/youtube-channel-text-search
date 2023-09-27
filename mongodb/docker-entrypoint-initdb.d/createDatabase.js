
db.createCollection( "youtubeVideos")
db.youtubeVideos.createIndex( { "channelId": 1 } )
db.youtubeVideos.createIndex( { "videoId": 1 } )
db.youtubeVideos.createIndex( { "publishTime": 1 } )

db.createCollection( "youtubeTranscripts")

db.youtubeTranscripts.createIndex( { "youtube": 1 } )

