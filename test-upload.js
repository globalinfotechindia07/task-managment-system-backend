const fs = require('fs');
const http = require('http');

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhNWUxZGQ4ZDg4MDJjOTAyOWNiMDMxNyIsImlhdCI6MTc4NzcyNDQ0OCwiZXhwIjoxNzkwMzE2NDQ4fQ.pJFa-D78rn_ZE2jajnazkbb1f2XqXPU9OPxk8rtnWMg';

const fileContent = fs.readFileSync('package.json');
let body = Buffer.from('--' + boundary + '\r\n' +
'Content-Disposition: form-data; name="profilePicture"; filename="test.json"\r\n' +
'Content-Type: application/json\r\n\r\n');
body = Buffer.concat([body, fileContent, Buffer.from('\r\n--' + boundary + '--\r\n')]);

const options = {
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/auth/profile',
  method: 'PUT',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Authorization': 'Bearer ' + token,
    'Content-Length': body.length
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => { 
    console.log('STATUS:', res.statusCode); 
    console.log('BODY:', data); 
  });
});
req.write(body);
req.end();
