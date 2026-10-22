# VPN gateway / server prerequisite

This project contains the Android WireGuard client. It does **not** include or pretend to provide a remote VPN gateway.

For a real VPN connection, supply a valid WireGuard configuration from a reputable provider or provision and maintain a WireGuard server that you control. The configuration must match the server's private/public key relationship, endpoint address and port, assigned tunnel address, allowed IP routes, DNS settings, and any firewall/NAT rules required by the server network.

Do not publish private keys, upload client configurations to a public repository, or copy a profile from an unknown source. The app stores imported configuration in its private app storage, but this project does not add a separate cryptographic vault around the file. Removing the profile from Settings deletes the local copy.

A server is not automatically supplied by a client APK. Do not enter made-up server values or claim the VPN is operational until a real server has been tested from both Wi-Fi and mobile data.
