## A cross-device log, mostly serverside
### registration
- By default homepage requires pre-registered passkey to login
- if we one goes to /register then it lets one register a passkey. this url is not advertied....one registers device name and associated pubkey
- registrations go into data/registrations.yaml which is a list og name+pubkey
- there is also a data/users.yaml which is a list of users that are validated
- if you login and you are not in users.yaml...then you are shown  'in registration queue'
- once someone moves you into users.yanl you see full app

### log: simple, secure cross-device share
- server-side rendered via hono
- textbox on top + submit + enter submits
- once submitted data goes into data/log.jsonl
- it is rendered as a line + copy button, kinda like irc, but sorted newest to oldest..also a tag representing what device it came from