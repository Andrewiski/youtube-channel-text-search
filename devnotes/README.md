
### upgrade all the dependencis in package.json
'''
 npx npm-check-updates -u
'''

### mongo 4.4.? on synology
'''
08/16/2023 I had to downgrade mongo to 4.4.23 as mongo 5 added requirement of avx on cpu and synology doesn't support also was post about kubernetes not having avx support
'''
### synology Cheat Cheat
'''
#https://davejansen.com/manage-docker-without-needing-sudo-on-your-synology-nas/
sudo synogroup --add docker
sudo synogroup --member docker $USER
sudo chown root:docker /var/run/docker.sock
'''