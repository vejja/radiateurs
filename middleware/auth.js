export default function (req, res, next) {
  // Check if user is authenticated here
  // You can use req to access the request object
  // And use res to send a response
  // If user is authenticated, call next()
  // If not, redirect to login page or send an error response
  if (req.isAuthenticated()) {
    return next();
  } else {
    res.redirect('/login');
  }
}