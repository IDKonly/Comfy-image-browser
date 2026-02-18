from PIL import Image
import sys

def print_metadata(file_path):
    try:
        with Image.open(file_path) as img:
            print("Image Format:", img.format)
            print("Image Info:")
            for key, value in img.info.items():
                try:
                    print(f'  "{key}": "{value}"')
                except UnicodeEncodeError:
                    print(f'  "{key}": {value.encode(sys.stdout.encoding, errors="replace")}')
    except Exception as e:
        print(f"Error reading file: {e}")

# Please replace this with the actual path to your image file
image_path = "D:/250216ComfyUI_windows_portable_nvidia/ComfyUI/output/2025-09-07/danbooru tag 캐기/2025-09-07-065131.png"
print_metadata(image_path)
