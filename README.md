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

### Download node.js ARMv6 binaries from nodejs.org
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

```
cat /dev/ttyAMA0
gpio i2cd
```

If needed : 

`sudo nano /boot/cmdline.txt`

* Supprimer console=ttyAMA0,115200 kgdboc=ttyAMA0,115200

`sudo nano /etc/modules`

* i2c-bcm2708 
* i2c-dev

`sudo nano /boot/config.txt`

* dtparam=i2c=on
* dtparam=i2c_arm=on