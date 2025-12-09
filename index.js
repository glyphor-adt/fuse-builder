// index.js
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const app = express();

app.use(express.json({ limit: '50mb' })); // Allow large file payloads

// 1. The Build Endpoint
app.post('/validate', async (req, res) => {
  const { files, dependencies } = req.body;
  const buildId = crypto.randomUUID();
  const workDir = path.join('/tmp', buildId);

  try {
    // A. Setup Workspace
    await fs.ensureDir(workDir);
    
    // B. Write Files
    // Iterate through your file array and write them to disk
    for (const file of files) {
        const filePath = path.join(workDir, file.path);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, file.content);
    }

    // C. "Smart" Install (The Secret Sauce)
    // Instead of running 'npm install' from scratch (slow), we use a pre-cached
    // node_modules folder from our Docker image and link it.
    // If the user has unique deps, we run a fast install.
    await fs.copy('/app/cache/node_modules', path.join(workDir, 'node_modules'));
    
    // D. Run Build
    // We exec vite build and capture stdout/stderr
    const buildCommand = 'npx vite build'; 
    
    exec(buildCommand, { cwd: workDir }, async (error, stdout, stderr) => {
        // CLEANUP: Always remove temp files to prevent memory leaks
        await fs.remove(workDir);

        if (error) {
            // BUILD FAILED
            return res.status(400).json({
                success: false,
                logs: stderr || stdout, // Vite often puts errors in stdout
                error: error.message
            });
        }

        // BUILD SUCCESS
        return res.json({
            success: true,
            logs: stdout
        });
    });

  } catch (err) {
    await fs.remove(workDir);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Glyphor Builder listening on ${PORT}`));