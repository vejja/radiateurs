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
* Enable SPI
* Enable I2C
* Boot into CLI
* Wait for Network at Boot
* sudo reboot

### Wifi configuration
* sudo nano /etc/wpa-supplicant/wpa-supplicant.conf
* network={
        ssid="****"
        psk="****"
        key_mgmt=WPA-PSK
}
* sudo nano /etc/network/interfaces
* auto wlan0
* sudo timedatectl set-ntp true

### sudo apt-get install
* git
* nginx
* sqlite3
* ddclient

### Download node.js ARM binaries from nodejs.org
* npm install -g forever

### Paramétrage de ddclient
* cd /etc
* sudo rm ddclient.conf
* sudo ln -s ~/django/cmd_web/ddclient.conf ddclient.conf


### ttyAMA0
* sudo nano /boot/cmdline.txt
* Supprimer console=ttyAMA0,115200 kgdboc=ttyAMA0,115200
* sudo systemctl stop serial-getty@ttyAMA0.service
* sudo systemctl disable serial-getty@ttyAMA0.service
* sudo nano /etc/rc.local
* stty -F /dev/ttyAMA0 1200 sane evenp parenb cs7 -crtscts

### i2c
* sudo nano /etc/modules
* i2c-bcm2708 
* i2c-dev
* sudo nano /boot/config.txt
* dtparam=i2c1=on
* dtparam=i2c_arm=on

### Parametrage de nginx
* cd /etc/nginx/sites-available
* sudo ln -s ~/django/cmd_web/nginx.conf radiateurs.conf
* cd /etc/nginx/sites-enabled
* sudo ln -s ../sites-available/radiateurs.conf radiateurs.conf
* sudo service nginx restart