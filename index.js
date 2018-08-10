var config = {
    webhookSecret: process.env.GIT_WEBHOOK_SECRET,
    clientId: process.env.GIT_CLIENT_ID,
    clientSecret: process.env.GIT_CLIENT_SECRET
}

var http = require('http')
var createHandler = require('github-webhook-handler')
var url = require('url')
var qs = require('querystring')
var github = require('octonode');

var webhookHandler = createHandler({ path: '/webhook', secret: config.webhookSecret })
var ghClient = undefined;

http.createServer(function (req, res) {
    var uri = url.parse(req.url);
    // Redirect to github login
    if (uri.pathname=='/') home(req, res);
    if (uri.pathname=='/login') githubLogin(req, res);
    else if (uri.pathname=='/auth') githubCallback(req, res);
    else webhookHandler(req, res, function (err) {
        console.log(req.url.split('?').shift());
        res.statusCode = 404
        res.end('no such location')
    });
}).listen(7777)

webhookHandler.on('error', function (err) {
  console.error('Error:', err.message)
})

webhookHandler.on('pull_request', function (event) {
    if (!ghClient){
        console.log('Not logged in to github yet.')
        return;
    }

    const title = event.payload.pull_request.title;
    const body = event.payload.pull_request.body;
    const isUnChecked = /-\s\[\s\]/g.test(body);
    const sha = event.payload.pull_request.head.sha;
    const repoName = event.payload.repository.full_name;

    console.log(`${repoName} : ${sha} -> ${isUnChecked}`);

    var ghRepo = ghClient.repo(repoName);

    ghRepo.status(sha, {
        'state': isUnChecked ? 'failure' : 'success',
        'context': 'Task list',
        'description': isUnChecked ? 'Some tasks are not checked': 'All tasks checked.  Ready to go!'
      }, function(error, data, headers){
          if (error){
              console.log(error, data);
          }
      }); 
})

function home(req, res){
    res.writeHead(200, 'OK');
    var output = '<h1>Git Checkblocks</h1>';
    if (ghClient)
        output += 'Authenticated to github<br />';
    else
        output += 'Not authenticated. <a href="/login">Log in</a>';
    var output = `<!doctype html><html><head><title>Git Checkblocks</title><body>${output}</body></html>`
    res.end(output);
}

var csrfGuard

function githubLogin(req, res){

    // Build the authorization config and url
    var auth_url = github.auth.config({
        id: config.clientId,
        secret: config.clientSecret
    }).login(['repo:status']);

    csrfGuard = auth_url.match(/&state=([0-9a-z]{32})/i);

    res.writeHead(302, {'Content-Type': 'text/plain', 'Location': auth_url})
    res.end('Redirecting to ' + auth_url);
}

function githubCallback(req, res){
    var uri = url.parse(req.url);
    var values = qs.parse(uri.query);
    // Check against CSRF attacks
    if (!csrfGuard || csrfGuard[1] != values.state) {
        res.writeHead(403, {'Content-Type': 'text/plain'});
        res.end('');
    } else {
        github.auth.login(values.code, function (err, token, headers) {
            ghClient = github.client(token);
            console.log('Client initialized');
            res.writeHead(302, {'Content-Type': 'text/plain', 'Location': '/'})
            res.end('Authenticated');
        });
    }
}
