# Security

Report vulnerabilities privately through the repository owner's GitHub security reporting channel.

ScreenReel executes actions in the host page. It rejects external navigation by default, does not evaluate arbitrary JavaScript, and limits page-function actions to named globals with JSON arguments. Remote flow files require browser CORS permission. Studio data stays in project-namespaced browser storage.

Studio availability is not an authorization boundary. Do not place secrets in flows or talking points.
