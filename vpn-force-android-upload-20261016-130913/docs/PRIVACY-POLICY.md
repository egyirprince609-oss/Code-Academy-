# Code Academy VPN Force — Privacy Policy Draft

**Last updated: 16 October 2026**

This draft must be reviewed and hosted at a public HTTPS URL before public release. Update the contact address and any practices that change in the production build.

## What the app does

Code Academy VPN Force is a native Android client for user-imported WireGuard VPN profiles. The app asks for Android VPN approval before it starts a tunnel. It shows the connection state and the device network type/validation state reported by Android.

## VPN profile and traffic

A WireGuard configuration contains sensitive key material and connection details. The app stores the imported profile in its private application storage and does not intentionally send the profile file to a Code Academy-owned backend. Do not share the profile or device with people you do not trust.

When a VPN tunnel is active, network packets are routed according to the routes and DNS details in the imported profile to the remote endpoint named in that profile. The VPN server operator may process connection metadata and traffic as allowed by the server's setup and applicable law. The app developer does not control third-party VPN servers. Use a trusted provider and review its privacy terms.

A VPN does not guarantee that the connection is anonymous, faster, uninterrupted, or protected from every form of tracking. It does not strengthen a phone's cellular or Wi-Fi radio signal.

## Account pages and external services

The Account screen opens the existing Code Academy website profile page. Website authentication and Firebase-related requests are handled by the website and its configured service providers under the policies shown there. This Android VPN client does not ask for or transfer the user's website password to the VPN tunnel engine.

## Notifications and system settings

Android may display the app's ongoing notification while the VPN service is active and separately shows its system VPN indicator. The user can manage notification permission in Android Settings. Android controls the system-level “Block connections without VPN” kill switch.

## Data, diagnostics, and sharing

This source build does not include an analytics SDK or an app-owned telemetry endpoint. The dashboard reads the network type and whether Android marks a network as internet-capable/validated. The Share action passes an informational text message to Android's system share sheet; the user selects whether and where to share it.

## Retention and deletion

The profile remains in private app storage until removed in the Settings screen or the app is uninstalled. Uninstalling the app removes its private files according to Android's normal app-storage behaviour. Traffic and logs held by a third-party VPN gateway are governed by that gateway operator's policy.

## Children and contact

This app is intended to be used with a VPN provider or server account managed by the user or their household. A production publisher should supply an official support contact here: **[add the official Code Academy support contact before release]**.

## Changes

Update this page whenever the app adds analytics, backend services, remote config delivery, account features, or different data handling. This draft alone is not a guarantee of legal or store-policy compliance.
