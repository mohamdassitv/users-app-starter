#!/bin/sh
# Add new admins to STAFF_DIRECTORY

# Update ileel to have manager:true
sed -i "s/{name:'Ilee Levanon', email:'ileel@checkpoint.com', phone:'0535232542'}/{name:'Ilee Levanon', email:'ileel@checkpoint.com', phone:'0535232542', manager:true}/" /app/src/server.js

# Add lihias and nitaid after the last entry (before the closing bracket)
sed -i "s/{name:'Yana Silutin', email:'yanasi@checkpoint.com', phone:'0542519667'}$/\{name:'Yana Silutin', email:'yanasi@checkpoint.com', phone:'0542519667'\},\n  \{name:'Lihia S', email:'lihias@checkpoint.com', phone:'0542578783', manager:true\},\n  \{name:'Nitai D', email:'nitaid@checkpoint.com', phone:'0548181885', manager:true\}/" /app/src/server.js

echo "Updated STAFF_DIRECTORY"
grep -A 20 'STAFF_DIRECTORY' /app/src/server.js | head -25
