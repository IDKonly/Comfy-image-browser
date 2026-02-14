import collections
import re
from PIL import Image
from config import logger, debug_decorator

# Pre-compile regex for performance
LORA_PATTERN = re.compile(r'<lora:([^>]+)>')
PARAM_PATTERN = re.compile(r'(\\w+(?:\\s\\w+)*): ([^,]+(?:, [^,]+)*),?')

class LRUCache(collections.OrderedDict):
    """Least Recently Used (LRU) cache implementation."""
    def __init__(self, maxsize):
        super().__init__()
        self.maxsize = maxsize if maxsize > 0 else 1

    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        if self.maxsize == 0: # Cache is disabled
            return
        if key in self:
            self.move_to_end(key)
        super().__setitem__(key, value)
        if len(self) > self.maxsize:
            oldest = next(iter(self))
            del self[oldest]

    def change_maxsize(self, new_maxsize):
        self.maxsize = new_maxsize if new_maxsize > 0 else 1
        if self.maxsize == 0:
            self.clear()
            return
        while len(self) > self.maxsize:
            oldest = next(iter(self))
            del self[oldest]

def get_image_info_fast(image_path):
    """
    Reads image metadata without loading the full image data.
    Returns: (width, height, info_dict)
    """
    try:
        with Image.open(image_path) as img:
            return img.width, img.height, img.info
    except Exception as e:
        logger.error(f"Failed to read image info for {image_path}: {e}")
        return 0, 0, {}

def parse_metadata_fast(metadata):
    """
    Optimized metadata parser using string slicing and pre-compiled regex.
    """
    if not metadata or 'parameters' not in metadata:
        return {}

    params_string = metadata['parameters']
    parsed_data = {}

    # 1. Find Separators
    neg_start = params_string.find('\nNegative prompt: ')
    steps_start = params_string.find('\nSteps: ')

    # 2. Extract Positive Prompt
    if neg_start != -1:
        positive_prompt = params_string[:neg_start]
        neg_content_start = neg_start + len('\nNegative prompt: ')
    elif steps_start != -1:
        positive_prompt = params_string[:steps_start]
        neg_content_start = -1
    else:
        positive_prompt = params_string
        neg_content_start = -1

    parsed_data['Prompt'] = positive_prompt.strip()

    # 3. Extract Negative Prompt
    if neg_content_start != -1:
        if steps_start != -1:
            parsed_data['Negative prompt'] = params_string[neg_content_start:steps_start].strip()
        else:
            parsed_data['Negative prompt'] = params_string[neg_content_start:].strip()
    else:
        parsed_data['Negative prompt'] = ""

    # 4. Extract LoRAs
    loras = LORA_PATTERN.findall(positive_prompt)
    if loras:
        parsed_data['LoRAs'] = ", ".join(loras) # Store as string for DB

    # 5. Extract Other Parameters
    if steps_start != -1:
        other_params_str = params_string[steps_start + 1:]
        matches = PARAM_PATTERN.findall(other_params_str)
        for key, value in matches:
            parsed_data[key.strip()] = value.strip()

    return parsed_data