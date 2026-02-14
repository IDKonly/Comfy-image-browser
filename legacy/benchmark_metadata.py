
import time
import re
import collections
from PIL import Image

# --- Legacy Parser ---
def parse_detailed_metadata_legacy(metadata):
    if not metadata or 'parameters' not in metadata:
        return None

    params_string = metadata['parameters']
    parsed_data = collections.OrderedDict()

    parts = re.split(r'\nNegative prompt: ', params_string, 1)
    positive_prompt = parts[0]
    
    other_params_str = ""
    if len(parts) > 1:
        neg_parts = re.split(r'\nSteps: ', parts[1], 1)
        parsed_data['Negative prompt'] = neg_parts[0].strip()
        if len(neg_parts) > 1:
            other_params_str = f"Steps: {neg_parts[1]}"
    else:
        pos_parts = re.split(r'\nSteps: ', positive_prompt, 1)
        positive_prompt = pos_parts[0]
        if len(pos_parts) > 1:
            other_params_str = f"Steps: {pos_parts[1]}"

    parsed_data['Prompt'] = positive_prompt.strip()

    lora_pattern = re.compile(r'<lora:([^>]+)>')
    loras = lora_pattern.findall(positive_prompt)
    if loras:
        parsed_data['LoRAs'] = loras

    if other_params_str:
        param_pattern = re.compile(r'(\w+(?: \w+)*): ([^,]+(?:, [^,]+)*),?')
        matches = param_pattern.findall(other_params_str)
        for key, value in matches:
            parsed_data[key.strip()] = value.strip()
            
    return parsed_data

# --- Optimized Parser ---
# Pre-compile regex
LORA_PATTERN = re.compile(r'<lora:([^>]+)>')
PARAM_PATTERN = re.compile(r'(\w+(?: \w+)*): ([^,]+(?:, [^,]+)*),?')

def parse_detailed_metadata_optimized(metadata):
    if not metadata or 'parameters' not in metadata:
        return None

    params_string = metadata['parameters']
    parsed_data = collections.OrderedDict()

    # 1. Find Separators using string methods (Faster than re.split)
    neg_start = params_string.find('\nNegative prompt: ')
    steps_start = params_string.find('\nSteps: ')

    # 2. Extract Positive Prompt
    if neg_start != -1:
        positive_prompt = params_string[:neg_start]
        neg_content_start = neg_start + len('\nNegative prompt: ')
    elif steps_start != -1: # No negative prompt
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

    # 4. Extract LoRAs (Only from Positive Prompt)
    # Using pre-compiled regex
    loras = LORA_PATTERN.findall(positive_prompt)
    if loras:
        parsed_data['LoRAs'] = loras

    # 5. Extract Other Parameters
    if steps_start != -1:
        other_params_str = params_string[steps_start + 1:] # Skip newline
        # Simple manual parsing for key-value pairs might be faster or just use regex
        # For now, use pre-compiled regex for safety and correctness as manually parsing CSV-like structure is error-prone
        matches = PARAM_PATTERN.findall(other_params_str)
        for key, value in matches:
            parsed_data[key.strip()] = value.strip()

    return parsed_data

def benchmark():
    # Load image once
    img = Image.open('test.png')
    metadata = img.info
    img.close()

    iterations = 10000

    start_time = time.time()
    for _ in range(iterations):
        parse_detailed_metadata_legacy(metadata)
    legacy_duration = time.time() - start_time

    start_time = time.time()
    for _ in range(iterations):
        parse_detailed_metadata_optimized(metadata)
    optimized_duration = time.time() - start_time

    print(f"Iterations: {iterations}")
    print(f"Legacy Parser: {legacy_duration:.4f} sec")
    print(f"Optimized Parser: {optimized_duration:.4f} sec")
    print(f"Speedup: {legacy_duration / optimized_duration:.2f}x")
    
    # Validation
    res_legacy = parse_detailed_metadata_legacy(metadata)
    res_opt = parse_detailed_metadata_optimized(metadata)
    
    # Keys check
    if res_legacy.keys() != res_opt.keys():
        print("Mismatch in keys!")
        print("Legacy keys:", res_legacy.keys())
        print("Optimized keys:", res_opt.keys())
    
    # Content check (Sample)
    for k in res_legacy:
        if res_legacy[k] != res_opt[k]:
             print(f"Mismatch in content for key '{k}'")
             # print(f"Legacy: {res_legacy[k]}")
             # print(f"Optimized: {res_opt[k]}")

if __name__ == "__main__":
    benchmark()
