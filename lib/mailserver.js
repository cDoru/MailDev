
/**
 * MailDev - mailserver.js
 */

var simplesmtp    = require('simplesmtp')
  , MailParser    = require('mailparser').MailParser
  , events        = require('events')
  , eventEmitter  = new events.EventEmitter()
  , MailComposer  = require('mailcomposer').MailComposer
  , settings      = require('./settings')
  , fs            = require('fs')
  , os            = require('os')
  , path          = require('path')
  ;

var port          = 1025
  , store         = []
  , tempDir       = path.join(os.tmpdir(), 'maildev')
  ;


/**
 * Mail Server exports
 */

var mailServer = module.exports = {};

mailServer.store = store;


/**
 * SMTP Server stream and helper functions
 */

// Clone object
function clone(object){
  return JSON.parse(JSON.stringify(object));
}

// Create an unique id, length 8 characters
function makeId(){
  var text = ''
    , possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    ;

  for (var i = 0; i < 8; i++){
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Save an email object on stream end
function saveEmail(mailObject){
  var object = clone(mailObject);
  
  object.id = makeId();
  object.time = new Date();
  object.read = false;
  
  store.push(object);
  console.log('Saving email: ', mailObject.subject);

  eventEmitter.emit('new');
}

// Save an attachment
function saveAttachment(attachment){
  var output = fs.createWriteStream(path.join(tempDir, attachment.contentId));
  attachment.stream.pipe(output);
}


// SMTP server stream functions
function newStream(connection){

  connection.saveStream = new MailParser({
    streamAttachments: true
  });
    
  connection.saveStream.on('attachment', saveAttachment);
  connection.saveStream.on('end', saveEmail);
}

function writeChunk(connection, chunk){
  connection.saveStream.write(chunk);
}

function endStream(connection, done){
  connection.saveStream.end();
  // ABC is the queue id to be advertised to the client
  // There is no current significance to this.
  done(null, 'ABC');
}


/**
 * Delete all attachments in the temp folder
 */

function deleteAllAttachments(){

  fs.readdir(tempDir, function(err, files){
    if (err) throw err;

    files.forEach(function(file){
      fs.unlink( path.join(tempDir, file), function(err) {
        if (err) throw err;
      });
    });
  });
}


/**
 * Delete a single attachment by id
 */

function deleteAttachments(id) {
  var mail = store[id];

  mail.attachments.forEach(function(attachment){
    fs.unlink( path.join(tempDir, attachment.contentId), function (err) {
      if (err) console.error(err);
    });
  });
}


/**
 * Create temp folder
 */

function createTempFolder(){

  fs.exists(tempDir, function(exists){
    if (exists){
      deleteAllAttachments();
      return;
    }

    fs.mkdir(tempDir, function(err){
      if (err) throw err;
    });

  });
}


/**
 * Start the mailServer
 */

mailServer.start = function(){
  // Start the server & Disable DNS checking
  var smtp = simplesmtp.createServer({
    disableDNSValidation: true
  });

  // Setup temp folder for attachments
  createTempFolder();

  // Listen on the specified port
  smtp.listen(port, function(err){
    if (err) throw err;
    console.log('MailDev SMTP Server running at 127.0.0.1:' + port);
  });

  // Bind events to stream
  smtp.on('startData', newStream);
  smtp.on('data', writeChunk);
  smtp.on('dataReady', endStream);
};

/**
 * Event Emitter
 * events:
 *   'new' - emitted when new email has arrived
 */
mailServer.eventEmitter = eventEmitter;


/**
 * Get an email by id
 */

mailServer.getMail = function(id){
  return store.filter(function(element, index, array){
    return element.id === id;
  })[0];
};


/**
 * Get all email
 */

mailServer.getAllMail = function(){
  return store;
};


/**
 * Delete an email by id
 */

mailServer.deleteMail = function(id){
  var mailIndex = null;

  store.forEach(function(element, index, array){
    if (element.id === id){
      mailIndex = index;
    }
  });

  if (mailIndex !== null){
    deleteAttachments(mailIndex);
    store.splice(mailIndex, 1);
    return true;
  } else {
    return false;
  }
};


/**
 * Delete all emails in the store
 */

mailServer.deleteAllMail = function(){
  deleteAllAttachments();
  store.length = 0;
  return true;
};


/**
 * Get attachment information by email id and filename
 */

mailServer.getAttachmentInfo = function(id, filename, done){
  var email = mailServer.getMail(id)
    , match
    ;

  if (!email.attachments || !email.attachments.length)
    done(new Error('Email has no attachments'));

  match = email.attachments.filter(function(attachment){
    return attachment.generatedFileName === filename;
  })[0];

  if (match){
    done(null, match);
  } else {
    done(new Error('Attachment not found'));
  }
};

/**
 * Return a readable file stream of an attachment that can be piped to a response
 */

mailServer.attachmentReadStream = function(attachment){
  return fs.createReadStream( path.join(tempDir, attachment.contentId) );
};

/**
 * Setup forwarding
 */

/* NOT OPERATIONAL

function connectToClientPool(){

  settings.read(function(err, config){
    if (err) console.error(err);

    try {
      if (config.email.user && config.email.pass){
        
        // Forward Mail options
        gmailOptions = {
            name: 'Gmail'
          , secureConnection: true
          , auth: {
                user: config.email.user
              , pass: config.email.pass
            }
          , debug: true
        };
        clientPool = simplesmtp.createClientPool(465, 'smtp.gmail.com', gmailOptions);
      }
    } catch (err){
      console.error('Error connecting to SMTP Server for outgoing mail', err);
    }
  });
}

connectToClientPool();

mailServer.sendMail = function(mail){
  if (!clientPool) return;

  var newEmail = new MailComposer();
  newEmail.setMessageOption({
      from: gmailOptions.auth.user
    , to: gmailOptions.auth.user
    , subject: mail.subject
    , body: mail.body
    , html: mail.html
  });

  clientPool.sendMail(newEmail, function(err, response){
    if (err) console.error('Mail Delivery Error: ', err);
    console.log('Mail Delivered: ', mail.subject);
  });
}
*/
