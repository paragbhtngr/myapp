var express = require('express');
var exphbs = require('express-handlebars');
var app = express();
var bodyParser = require('body-parser');
var session = require('express-session');
var MongoDBStore = require('connect-mongodb-session')(session);
var bcrypt = require('bcrypt-nodejs');
var mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URL);
// var bcrypt = require('bcrpyt');
var Users = require('./models/users.js');
var Tasks = require('./models/tasks.js');


var store = new MongoDBStore({
  uri: process.env.MONGO_URL,
  collection: 'sessions'
});
app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {secure: 'auto'},
  store: store
}));

app.use(function(req, res, next){
  console.log('req.session =', req.session);
  if(req.session.userId){
      Users.findById(req.session.userId, function(err, user){
        if(!err){
          res.locals.currentUser = user;
        }
        next();
      });
  }else {
    next();
  }
});

function isLoggedIn(req, res, next){
  if(res.locals.currentUser){
    next();
  } else {
    res.sendStatus(403);
  }
}

function loadUserTasks(req, res, next){
  if(!res.locals.currentUser){
    return next();
  }
  Tasks.find({}).or([
    {owner: res.locals.currentUser},
    {collaborators: res.locals.currentUser.email}
  ])
  .exec(function(err, tasks){
    if(!err){
      res.locals.tasks = tasks;
    }
    next();
  });
}

app.get('/', loadUserTasks, function(req, res) {
  res.render('home');
});

app.post('/user/login', function(req, res) {
  var user = Users.findOne({email: req.body.email}, function(err, user){
    if(err || !user){
      res.send('bad login, no such user');
      return;
    }
//  if(bcrypt.compare(req.body.password, user.hashed_password, function(err, res) {})){
    if(req.body.password === user.hashed_password){
      req.session.userId = user._id;
      res.redirect('/');
    } else {
      console.log(user.hashed_password);
      // console.log(bcrypt.hash(req.body.password, null, null, function(err, hash) {}));
      res.send('incorrect password');
    }
  });
});
app.post('/user/register', function(req, res) {
  if(req.body.password !== req.body.password_confirmation){
    return res.render('home', {errors: "Password and Password confirmation do not match"});
  }
  var newUser = new Users();
  newUser.hashed_password = req.body.password;
  // console.log(bcrypt.hash(req.body.password, null, null, function(err, hash) {}));
  newUser.email = req.body.email;
  newUser.name = req.body.fl_name;
  newUser.save(function(err, user){
    if(err){
      res.render('home', {errors: err});
    }else {
      req.session.userId = user._id;
      res.redirect('/');
    }
  });
  console.log('The user has the email address', req.body.email);
});

app.get('/user/logout', function(req, res) {
  req.session.destroy();
  res.redirect('/');
});

app.use(isLoggedIn);

app.post('/tasks/create', function(req,res){
  var newTask = new Tasks();
  newTask.owner = res.locals.currentUser._id;
  newTask.title = req.body.title;
  newTask.description = req.body.description;
  newTask.collaborators = [req.body.collaborator1,req.body.collaborator2,req.body.collaborator3];
  newTask.save(function(err, savedTask){
    if(err || !savedTask){
      res.send('Error saving task!');
    } else {
      res.redirect('/');
    }
  });
});

app.post('/tasks/toggle', function(req, res){
  Tasks.findById(req.body.taskId, function(err, task){
    if(err || !task){
      res.send('no such task');
      return;
    }
    else {
      console.log('Found task', task.title);
      if(task.isComplete){
        task.update({ isComplete: false }, function (err, raw) {
          if (err) return handleError(err);
        });
        console.log('Task was complete. Task is now incomplete');
      }
      else {
        task.update({ isComplete: true }, function (err, raw) {
          if (err) return handleError(err);
        });
        console.log('Task was incomplete. Task is now complete');
      }
    }
  });
});

app.post('/tasks/delete', function(req, res){
  Tasks.findById(req.body.taskId, function(err, task){
    if(err || !task){
      res.send('no such task');
      return;
    }
    else {
      console.log('Found task', task.title);
      if(res.locals.currentUser._id.toString() === task.owner.toString()){
        task.remove();
        console.log('Task was deleted');
      }
      else {
        console.log("I'm sorry. I can't let you do that");
      }
    }
  });
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
