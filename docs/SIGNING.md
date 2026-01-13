# Windows Code Signing Setup

This document explains how to configure Azure Trusted Signing for GnuNae Windows builds.

## GitHub Secrets Required

Add these secrets to your repository: **Settings → Secrets and variables → Actions**

| Secret | Description |
|--------|-------------|
| `AZURE_TENANT_ID` | Azure AD Tenant ID |
| `AZURE_CLIENT_ID` | App Registration Client ID |
| `AZURE_CLIENT_SECRET` | App Registration Secret |
| `AZURE_CODE_SIGNING_NAME` | Trusted Signing Account Name |
| `AZURE_CERT_PROFILE_NAME` | Certificate Profile Name |

## Certificate Details

```
Subject: CN=Won Dong, O=Won Dong, L=Sharon, S=Massachusetts, C=US
Thumbprint: BF8A8D52508CCFEADB75EBB4BAD19205CE065C17
```

## Azure Setup Checklist

- [ ] Create Trusted Signing Account in Azure
- [ ] Create App Registration in Azure AD
- [ ] Generate Client Secret for App Registration
- [ ] Assign "Trusted Signing Certificate Profile Signer" role
- [ ] Create Certificate Profile
- [ ] Add secrets to GitHub repository

## Testing

Push a tag to trigger a release build:
```bash
git tag v0.8.2-test
git push origin v0.8.2-test
```

Check the GitHub Actions logs for signing success.
