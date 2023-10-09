// Import necessary libraries and modules
var createError = require('http-errors');  // For creating HTTP errors
var express = require('express');  // Web framework
var path = require('path');  // Node.js path module
var cookieParser = require('cookie-parser');  // Middleware to parse cookies
var logger = require('morgan');  // HTTP request logger middleware

// Import route definitions
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

// Middleware for session handling
const session = require("express-session");

// Initialize the express application
var app = express();

// Set up the view engine for rendering templates
app.set('views', path.join(__dirname, 'views'));  // Set the directory for the views
app.set('view engine', 'hbs');  // Set the view engine to handlebars

// Set up middlewares
app.use(express.static('public')); // Serve static files from the 'public' directory
app.use(logger('dev'));  // Use the 'dev' log format for logging HTTP requests
app.use(express.json());  // Parse JSON request bodies
app.use(express.urlencoded({ extended: false }));  // Parse URL-encoded request bodies
app.use(cookieParser());  // Use cookie parser to parse cookies
app.use(express.static(path.join(__dirname, 'public')));  // Serve static files from the directory specified

// Set up session middleware
app.use(session({
  secret: 'your-secret-key',  // Encryption key for the session
  resave: false,  // Don't save session if unmodified
  saveUninitialized: true,  // Save uninitialized sessions
  cookie: { maxAge: 60000 * 30 }  // Set the cookie's expiration time to 30 minutes
}));

// Use the imported routes
app.use('/', indexRouter);  // Use the index route for the root path
app.use('/users', usersRouter);  // Use the users route for the '/users' path

// Catch 404 errors and forward them to the error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// General error handler
app.use(function(err, req, res, next) {
  // Set the local variables, only display errors in development mode
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Render the error page
  res.status(err.status || 500);
  res.render('error');
});

// Export the express app module to be used in other parts of the application
module.exports = app;
