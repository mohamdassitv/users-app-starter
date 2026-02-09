#!/bin/sh
# Add lihias and nitaid to STAFF_DIRECTORY

# Find the line with Yana and add new entries after it
sed -i "/phone:'0542519667'}$/ {
    s/}$/},/
    a\  {name:'Lihia S', email:'lihias@checkpoint.com', phone:'0542578783', manager:true},
    a\  {name:'Nitai D', email:'nitaid@checkpoint.com', phone:'0548181885', manager:true}
}" /app/src/server.js

echo "Result:"
grep -E 'Yana|Lihia|Nitai' /app/src/server.js
