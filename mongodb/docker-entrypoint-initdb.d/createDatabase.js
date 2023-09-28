
db.createCollection( "youtubeVideos")
db.youtubeVideos.createIndex( { "channelId": 1 } )
db.youtubeVideos.createIndex( { "videoId": 1 } )
db.youtubeVideos.createIndex( { "publishTime": 1 } )

db.createCollection( "youtubeTranscripts")

db.youtubeTranscripts.createIndex( { "videoId": 1 } )
db.youtubeTranscripts.createIndex( { "videoId": 1, "index": 1 } )
db.youtubeTranscripts.createIndex({
    "text" : "text",
    "nearText" : "text"
},
{
    "name" : "text_neartext_text",
    "weights" : {
        "nearText" : 1,
        "text" : 10
    }
}
)

