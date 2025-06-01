# Publishing PRD Assistant to VS Code Marketplace

This guide provides step-by-step instructions for publishing the PRD Assistant extension to the Visual Studio Code Marketplace.

> **Note**: Yes, you do need an Azure DevOps account to publish to the VS Code Marketplace. This is because Microsoft uses Azure DevOps infrastructure for managing the VS Code extension marketplace (this is for VS Code extensions, not Visual Studio IDE extensions).

## Prerequisites

### 1. Install Required Tools

```bash
# Install vsce (Visual Studio Code Extension Manager)
npm install -g @vscode/vsce

# Verify installation
vsce --version
```

### 2. Create Azure DevOps Account (Required)

VS Code uses Azure DevOps for its Marketplace services. You'll need:

1. Go to [Azure DevOps](https://dev.azure.com/)
2. Sign in with:
   - Your Microsoft account (create one if needed)
   - Or your GitHub account
3. Create a new organization (the name doesn't have to match your publisher name)

### 3. Create a Personal Access Token (PAT)

1. In Azure DevOps, click on your user icon → "Security"
2. Click "Personal access tokens" → "New Token"
3. Configure the token:
   - **Name**: `vsce-publish` (or any name you prefer)
   - **Organization**: Select "All accessible organizations"
   - **Expiration**: Set to your preference (max 1 year)
   - **Scopes**: Click "Show all scopes" and select:
     - **Marketplace**: Check all boxes under "Marketplace"
4. Click "Create" and **save the token immediately** (you won't see it again!)

### 4. Create a Publisher

The `vsce create-publisher` command is no longer available. You must create a publisher through the web interface:

1. Go to [VS Code Marketplace Publisher Management](https://marketplace.visualstudio.com/manage/createpublisher)
2. Sign in with the same Microsoft account you used for Azure DevOps
3. Click "Create Publisher"
4. Fill in the required information:
   - **Publisher ID**: A unique identifier (e.g., `your-name` or `your-company`)
     - This will be used in your extension's URL
     - Cannot be changed later
     - Use lowercase letters, numbers, and hyphens only
   - **Publisher Name**: Display name (e.g., "Your Name" or "Your Company")
   - **Description**: Brief description of your publisher
   - **Email**: Contact email
5. Click "Create"

## Prepare for Publishing

### 1. Update package.json

```json
{
  "publisher": "your-publisher-name", // ← Add your publisher ID here
  "icon": "images/icon.png", // ← Ensure you have an icon (128x128px recommended)
  "galleryBanner": {
    "color": "#2C2C2C", // ← Add banner color
    "theme": "dark"
  },
  "categories": [
    "Other",
    "Formatters",
    "Programming Languages" // ← Add relevant categories
  ]
}
```

### 2. Create/Update Required Files

#### README.md

Ensure your README.md includes:

- Clear description of what the extension does
- Features list with screenshots/GIFs
- Installation instructions
- Usage examples
- Requirements
- Known issues
- Release notes

#### CHANGELOG.md

Document all changes for each version:

```markdown
# Change Log

## [1.0.0] - 2024-01-XX

### Added

- Initial release
- Interactive checkbox management
- Task ID generation
- Tree view explorer
- CodeLens integration
- Progress reporting
```

#### Icon

- Create a 128x128px PNG icon at `images/icon.png`
- Use a clear, recognizable design
- Ensure good contrast on both light and dark backgrounds

### 3. Add Screenshots

Create a `images` folder with screenshots showing:

- The extension in action
- Tree view
- CodeLens features
- Any key features

Reference these in your README.md.

### 4. Test Locally

```bash
# Run all tests
npm test

# Package locally to test
vsce package

# This creates a .vsix file - install it locally to test:
# In VS Code: Extensions → ... → Install from VSIX
```

## Publishing Process

### 1. Verify Publisher Access

```bash
# Login with your publisher account
vsce login <your-publisher-id>
# Enter your Personal Access Token when prompted

# Verify you're logged in correctly
vsce ls-publishers
```

If you get an error, make sure:

- You're using the correct publisher ID (not display name)
- Your PAT has the correct Marketplace scopes
- The PAT hasn't expired

### 2. Publish the Extension

```bash
# First time publish
vsce publish

# Publish with version increment
vsce publish patch  # 1.0.0 → 1.0.1
vsce publish minor  # 1.0.0 → 1.1.0
vsce publish major  # 1.0.0 → 2.0.0

# Publish specific version
vsce publish 1.2.3

# Publish with custom message
vsce publish -m "Fixed critical bug in task management"
```

### 3. Pre-release Versions (Optional)

```bash
# Publish as pre-release
vsce publish --pre-release

# Or use package.json scripts
npm run publish:pre
```

## Post-Publishing

### 1. Verify Publication

- Go to [VS Code Marketplace](https://marketplace.visualstudio.com/)
- Search for your extension
- Verify all information is correct
- Test installation from the marketplace

### 2. Monitor Your Extension

- Check the [Publisher Management page](https://marketplace.visualstudio.com/manage)
- Monitor:
  - Download statistics
  - Ratings and reviews
  - Q&A section
  - Crash reports

### 3. Update Extension

When making updates:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Test thoroughly
4. Run `vsce publish patch/minor/major`

## Important Notes

### Do's

- ✅ Test extension thoroughly before publishing
- ✅ Include clear documentation
- ✅ Respond to user feedback and issues
- ✅ Keep the extension updated
- ✅ Use semantic versioning
- ✅ Include a license file

### Don'ts

- ❌ Don't include sensitive information (tokens, passwords)
- ❌ Don't include unnecessary files (use `.vscodeignore`)
- ❌ Don't publish untested code
- ❌ Don't use copyrighted material without permission

## Troubleshooting

### Common Issues

1. **"Missing publisher name"**

   - Add `"publisher": "your-name"` to package.json

2. **"Personal Access Token verification failed"**

   - Ensure PAT has Marketplace scopes
   - Check token hasn't expired
   - Try creating a new token

3. **"Icon not found"**

   - Ensure icon path in package.json is correct
   - Icon should be PNG format, 128x128px recommended

4. **Large package size**
   - Update `.vscodeignore` to exclude unnecessary files:
   ```
   .vscode/**
   .vscode-test/**
   src/**
   .gitignore
   .yarnrc
   vsc-extension-quickstart.md
   **/tsconfig.json
   **/.eslintrc.json
   **/*.map
   **/*.ts
   node_modules/**
   ```

### Getting Help

- [VS Code Extension API Documentation] (https://code.visualstudio.com/api)
- [Publishing Extensions Guide] (https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce Documentation] (https://github.com/microsoft/vscode-vsce)
- [VS Code Extension Samples] (https://github.com/microsoft/vscode-extension-samples)

## Alternative: Open VSX Registry

If you prefer not to use Azure DevOps, you can publish to [Open VSX Registry](https://open-vsx.org/), an open-source alternative marketplace:

1. Create an account at https://open-vsx.org/
2. Generate an access token in your profile settings
3. Publish using:

   ```bash
   # Install ovsx CLI
   npm install -g ovsx

   # Publish to Open VSX
   ovsx publish -p <token>
   ```

Note: Open VSX is supported by VS Code forks like VSCodium and Gitpod, but not the official VS Code by default.

## Quick Checklist

Before publishing, ensure:

- [ ] Publisher account created
- [ ] Personal Access Token generated
- [ ] `publisher` field added to package.json
- [ ] Version number is correct
- [ ] README.md is comprehensive
- [ ] CHANGELOG.md is up to date
- [ ] Icon is included (128x128px PNG)
- [ ] Screenshots are included
- [ ] Extension tested locally
- [ ] No sensitive data included
- [ ] `.vscodeignore` configured
- [ ] All tests pass
- [ ] License file included
