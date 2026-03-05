#!/bin/bash

# Setup CORS for Firebase Storage Bucket
# This script configures CORS rules to allow image uploads from the Vercel app

PROJECT_ID="nutritrack-ai-94a87"
BUCKET_NAME="${PROJECT_ID}.appspot.com"

echo "================================"
echo "Firebase Storage CORS Setup"
echo "================================"
echo ""
echo "Project ID: $PROJECT_ID"
echo "Bucket: gs://$BUCKET_NAME"
echo ""

# Check if gsutil is installed
if ! command -v gsutil &> /dev/null; then
    echo "❌ gsutil is not installed. Please install Google Cloud SDK:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated with gcloud
if ! gcloud auth application-default print-access-token &> /dev/null; then
    echo "❌ Not authenticated. Running 'gcloud auth application-default login'..."
    gcloud auth application-default login
fi

echo "📋 Applying CORS configuration..."
echo ""

# Apply the CORS configuration
gsutil cors set cors.json gs://$BUCKET_NAME

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ CORS configuration applied successfully!"
    echo ""
    echo "Configured origins:"
    echo "  • https://nutritrack-ai-one.vercel.app"
    echo "  • http://localhost:3000"
    echo "  • http://localhost:3001"
    echo "  • https://localhost:3000"
    echo ""
    echo "Allowed methods: GET, HEAD, DELETE, POST, PUT, OPTIONS, PATCH"
    echo "Response headers: * (all headers)"
    echo "Max caching time: 3600 seconds (1 hour)"
    echo ""
    
    # Verify the configuration was applied
    echo "📋 Verifying CORS configuration..."
    gsutil cors get gs://$BUCKET_NAME
    echo ""
    echo "✅ Setup complete! Image uploads should now work without CORS errors."
else
    echo ""
    echo "❌ Failed to apply CORS configuration."
    echo "Please check that:"
    echo "  1. You have permission to modify the bucket"
    echo "  2. The bucket exists and is accessible"
    echo "  3. You're logged in to Google Cloud (gcloud auth login)"
    exit 1
fi
