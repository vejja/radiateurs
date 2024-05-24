# README #

## Overview

### Le système complet comprend 3 composants

1. Un frontend client Ionic

Le frontend communique avec le backend essentiellement par Websocket

2. Un backend server NodeJS

Le serveur implémente le protocole Websocket
L'architecture repose sur un Raspberry PI et est composée des couches suivantes:
- nginx (SSL via let's encrypt, forwarde vers node)
- forever (relance node en cas d'arrêt, initialisé dans un RC script)
- NodeJS (websocket listen + reply + commande le Raspberry PI)
- une database sqlite qui stocke les données historiques
 
3. Un module hardware

Il est composé de : 1 convertisseur UART + 1 Raspberry PI + 1 carte pilote I2C radiateurs


- L'info du compteur EDF (téléinfo) doit d'abord être convertie au format UART
- Le Raspberry PI a un port entrée UART qui est utilisé pour lire les données EDF en temps réel
- Le Raspberry PI a un port sortie I2C qui est relié à une carte "Pilote" de contrôle des radiateurs individuels
- La carte Pilote convertit le signal bas voltage I2C du Raspberry PI en 8 sorties distinctes 220V grâce à 16 (2*8) optocoupleurs. A Erquy il y a 3 cartes Pilote (triphasé: une par phase)



### Au final, le Raspberry PI effectue plusieurs tâches simultanées:

- Serveur du code client statique
- Serveur websocket backend, applique les commandes de l'utilisateur
- Ecoute en continu le port entrée UART pour détecter les pics de consommation
- Ecrit sur le port de sortie I2C : allume et éteint les radiateurs (soit en manuel sur commande utilisateur, soit en automatique pour délester en cas de sur consommation)



Instructions pour installer le serveur radiateurs

## Installation Raspberry Pi ##

* Download Raspberry Pi Imager
* Install on SD card with custom options (set Wifi password & SSH via public key)
* Edit .sh file and add `key_mgmt=WPA-PSK` to the wpa_supplicant section under `network` 

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
* Decrease GPU memory to min (16MB)
* sudo reboot

### Wifi configuration
``` 
sudo nano /etc/wpa-supplicant/wpa-supplicant.conf
* network={
        ssid="****"
        psk="****"
        key_mgmt=WPA-PSK // This line must be manually added after rpi-imager
}
```

### Increase swap size to 1GB
```
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
>>> CONF_SWAPSIZE=1024
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
sudo reboot
```

### Install major utilities
```
sudo apt install git sqlite3 i2ctools
```

### Install ddclient
```
sudo apt install ddclient
```
Check the /etc/ddclient.conf file after setup

### Install nginx
```
sudo apt install nginx
```
Drop the default configuration files
- /etc/nginx/nginx.conf
- /etc/nginx/sites-available/erquy.vejja.fr

### Enable the basic auth module
```
sudo apt install apache2-utils
sudo htpasswd -c /etc/apache2/.htpasswd user1
```
Set password for HTTP basic auth on website

### Install Certbot
```
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d erquy.vejja.fr
```
certbot will automatically modify the Nginx default config file 

### Install fail2ban
```
sudo apt install fail2ban
```

### Download node.js ARMv6 binaries from nodejs.org

Go to nodejs.org
Find the unofficial builds for ARMv6l: https://unofficial-builds.nodejs.org/
https://unofficial-builds.nodejs.org/download/release/v20.13.1/node-v20.13.1-linux-armv6l.tar.xz


```
tar -xvf node-v20.13.1-linux-armv6l.tar.xz
cd node-v20.13.1-linux-armv6l
sudo cp -R * /usr/local/
node --version
```

### Install SystemD unit
Drop /etc/systemd/system file
```
sudo systemctl daemon-reload
sudo systemctl enable radiateurs
```

### Check ttyAMA0 and i2c

```
cat /dev/ttyAMA0
sudo i2cdetect -y 1
```

If needed : 

`sudo nano /boot/cmdline.txt`

* #Supprimer console=ttyAMA0,115200 kgdboc=ttyAMA0,115200

`sudo nano /etc/modules`

* #i2c-bcm2708 
* i2c-dev

`sudo nano /boot/config.txt`

* #dtparam=i2c=on
* dtparam=i2c_arm=on