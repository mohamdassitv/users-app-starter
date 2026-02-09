import sys
with open('/opt/waf-exam/docker-compose.yml') as f:
    c = f.read()
c = c.replace('backend:5001', 'backend:5000')
c = c.replace('text/plain|', 'text/plain|application/json|')
with open('/opt/waf-exam/docker-compose.yml', 'w') as f:
    f.write(c)
print('Fixed docker-compose.yml')
