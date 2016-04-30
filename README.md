# README #

Instructions pour installer le serveur radiateurs

## Installation Raspberry Pi ##

* Download Raspberry Pi Raspbian Jessie image
* Install

### sudo raspi-config
* Expand Filesystem
* Locale : fr-utf8
* Timezone : Europe/Paris
* Keyboard : French
* Change password
* Enable SSH
* Enable I2C
* Disable shell on serial connection
* Boot into CLI
* Wait for Network at Boot
* sudo reboot

### Wifi configuration
``` 
sudo nano /etc/wpa-supplicant/wpa-supplicant.conf
* network={
        ssid="****"
        psk="****"
        key_mgmt=WPA-PSK
}
sudo timedatectl set-ntp true
```

### Install major utilities
```
sudo apt-get install git nginx sqlite3 ddclient
```

### Install LetsEncrypt
```
git clone https://github.com/letsencrypt/letsencrypt
cd letsencrypt
./letsencrypt-auto --help
```

Check that `letsencrypt`is executable from the command line

If not: `sudo ln -s ~/.local/share/letsencrypt/bin/letsencrypt /usr/local/bin/letsencrypt`

### Download node.js ARM binaries from nodejs.org
```
npm install -g bower
npm install -g forever
npm install -g nodemon
npm install -g node-inspector
```

Check that node utilities are executable from the command line

If not: `sudo ln -s /opt/node/bin/<executable> /usr/local/bin/<executable>`


### Symlink config files
| Config file  | Repo Script | Description |
|--------------|-------------|-------------|
| /etc/ddclient.conf | ddclient.conf | *ddclient* keeps the dyndns record up to date with the IP address of the Livebox |
| /etc/nginx/nginx.conf | nginx.conf | websocket upstream definition |
| /etc/nginx/sites-available/default | default | SSL, Basic auth, websocket proxy forward |
| /etc/rc.local | rc.local | Boot script that launches the serial UART interface & the forever daemon that keeps node.js live in spite of crashes |

### Launch letsencrypt
```
cd radiateurs/server/scripts
./setup-certificate.sh
```

Then `sudo crontab -e` and add the line `30 3 * * * /home/pi/radiateurs/server/scripts/renew-certificate.sh >> /var/log/letsencrypt/cronjob.log`

### Check ttyAMA0 and i2c
`sudo nano /boot/cmdline.txt`
* Supprimer console=ttyAMA0,115200 kgdboc=ttyAMA0,115200

`sudo nano /etc/modules`
* i2c-bcm2708 
* i2c-dev

`sudo nano /boot/config.txt`
* dtparam=i2c=on
* dtparam=i2c_arm=on