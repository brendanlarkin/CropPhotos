from flask import Flask, render_template, request, send_file
from rembg import remove, new_session
from PIL import Image
import io
import os
import requests
from urllib.parse import urlparse
import logging
from werkzeug.utils import secure_filename
import torch

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'

# Ensure the upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Check if CUDA is available
device = 'cuda' if torch.cuda.is_available() else 'cpu'
app.logger.debug(f'Using device: {device}')

# Initialize the session once, reuse for multiple requests
session = new_session(model_name='isnet-general-use')  # Use desired model

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process_image():
    if 'image_file' in request.files:
        file = request.files['image_file']
        if file.filename == '':
            app.logger.error('No selected image file.')
            return 'No selected image file', 400

        # Save the uploaded file
        filename = secure_filename(file.filename)
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(input_path)

        # Open the image
        try:
            input_image = Image.open(input_path).convert('RGBA')
            app.logger.debug(f'Opened uploaded image: {filename}')
        except Exception as e:
            app.logger.error(f'Error opening uploaded image file: {e}')
            os.remove(input_path)
            return f'Error opening uploaded image file: {e}', 400

        # Clean up the uploaded file
        os.remove(input_path)

    elif 'image_url' in request.form:
        url = request.form['image_url']
        app.logger.debug(f'Received image URL: {url}')
        if not url:
            app.logger.error('No image URL provided.')
            return 'No image URL provided', 400
        try:
            input_image = fetch_image_from_url(url)
        except Exception as e:
            app.logger.error(f'Failed to fetch image from URL: {e}')
            return f'Failed to fetch image from URL: {e}', 500
    else:
        app.logger.error('No image data provided.')
        return 'No image data provided', 400

    # Process the image
    try:
        output_image = process_image_background(input_image, session)
        app.logger.debug('Image processing completed successfully.')

        # Optional: Save output image for debugging
        output_debug_path = os.path.join(app.config['UPLOAD_FOLDER'], 'output_debug.png')
        output_image.save(output_debug_path, 'PNG')
        app.logger.debug(f'Output image saved for debugging at {output_debug_path}')
    except Exception as e:
        app.logger.error(f'Failed to process image: {e}')
        return f'Failed to process image: {e}', 500

    # Save output image to BytesIO
    img_io = io.BytesIO()
    output_image.save(img_io, 'PNG')
    img_io.seek(0)

    return send_file(img_io, mimetype='image/png')

def fetch_image_from_url(url):
    try:
        # Validate URL
        parsed_url = urlparse(url)
        if not parsed_url.scheme.startswith('http'):
            raise ValueError('Invalid URL scheme')

        app.logger.debug(f'Fetching image from URL: {url}')

        # Fetch the image
        response = requests.get(url, timeout=10)
        response.raise_for_status()

        content_type = response.headers.get('Content-Type', '')
        if 'image' not in content_type:
            raise ValueError(f'URL does not point to an image. Content-Type: {content_type}')

        # Open the image
        input_image = Image.open(io.BytesIO(response.content)).convert('RGBA')
        app.logger.debug('Image fetched and opened successfully.')
        return input_image
    except Exception as e:
        app.logger.error(f'Error fetching image from URL: {e}')
        raise

def process_image_background(input_image, session):
    # Remove background using rembg with the created session and customized alpha matting
    output_image = remove(
        input_image,
        session=session,
        alpha_matting=True,
        alpha_matting_erode_size=0,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10
    )

    # Ensure alpha channel
    if output_image.mode != 'RGBA':
        output_image = output_image.convert('RGBA')

    # Optionally, adjust alpha channel safely
    datas = output_image.getdata()
    newData = []
    for item in datas:
        # Only modify alpha if the pixel is not fully transparent
        if item[3] > 0:
            new_alpha = min(item[3] + 15, 255)
            newData.append((item[0], item[1], item[2], new_alpha))
        else:
            newData.append(item)  # Keep fully transparent pixels unchanged
    output_image.putdata(newData)

    # Crop to non-transparent pixels
    bbox = output_image.getbbox()
    if bbox:
        cropped_image = output_image.crop(bbox)
        app.logger.debug('Image cropped to non-transparent pixels.')
    else:
        cropped_image = output_image
        app.logger.debug('No cropping needed.')

    return cropped_image

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5008)
