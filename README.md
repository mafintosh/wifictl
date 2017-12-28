# wifictl

Interactive command line tool to connect to WiFi networks on Linux

```
npm install -g wifictl
sudo wifictl
```

Powered by [diffy](https://github.com/mafintosh/diffy) and [wpa_supplicant](https://github.com/mafintosh/wpa_supplicant)

## Usage

After running the above `wifictl` will show a list of all discovered networks.
Select one you want to connect to and click `<enter>` to enter the wifi password.

All known networks are stored in `/root/.wifictl.json`.

When running it, it will automatically connect to the network seen, with the highest
priority specified in the `.wifictl.json` file.

## License

MIT
