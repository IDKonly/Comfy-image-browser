import argparse
import os
import sys
import core
import itertools
import re

class WildcardProcessor:
    def __init__(self):
        pass

    def compress(self, input_file, output_file, threshold=0.3):
        """
        Reads raw prompts and compresses them using the merge_tag_groups logic.
        """
        print(f"Compressing prompts from '{input_file}' with threshold {threshold}...")
        
        try:
            with open(input_file, 'r', encoding='utf-8') as f:
                # Read non-empty lines
                lines = [line.strip() for line in f if line.strip()]
        except FileNotFoundError:
            print(f"Error: Input file '{input_file}' not found.")
            return

        if not lines:
            print("Input file is empty.")
            return

        # Convert lines to sets of tags for the core logic
        tag_sets = [set(tag.strip() for tag in line.split(',') if tag.strip()) for line in lines]
        
        # Use the existing core logic
        # Note: core.merge_tag_groups returns a list of strings formatted as wildcards
        merged_results = core.merge_tag_groups(tag_sets, similarity_threshold=threshold)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("\n".join(merged_results))
            
        print(f"Success! Compressed {len(lines)} lines into {len(merged_results)} lines.")
        print(f"Saved to '{output_file}'.")

    def expand(self, input_file, output_file):
        """
        Reads wildcard prompts and expands them into all possible combinations.
        """
        print(f"Expanding wildcards from '{input_file}'...")
        
        try:
            with open(input_file, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
        except FileNotFoundError:
            print(f"Error: Input file '{input_file}' not found.")
            return

        all_expanded = []
        
        for line in lines:
            expanded_variations = self._expand_single_line(line)
            all_expanded.extend(expanded_variations)
            
        # Remove duplicates from expansion if desired, here we keep all permutations
        # converting to set to verify uniqueness
        unique_expanded = sorted(list(set(all_expanded)))
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("\n".join(unique_expanded))
            
        print(f"Success! Expanded {len(lines)} lines into {len(unique_expanded)} unique combinations.")
        print(f"Saved to '{output_file}'.")

    def _expand_single_line(self, text):
        """
        Recursively expands a single string containing nested brackets {A|B}.
        Example: "1boy, {A|B}" -> ["1boy, A", "1boy, B"]
        """
        # Find the first occurrence of {content}
        # We need to handle nested braces carefully, but a simple regex works for standard wildcards.
        # This regex finds the innermost braces that do not contain other braces.
        # However, to handle structure properly, we can split by logic.
        
        # Simple iterative approach: find first '{...}' block, expand it, repeat.
        
        variations = [text]
        
        while True:
            new_variations = []
            has_expansion = False
            
            for var in variations:
                match = re.search(r'\{([^{}]+)\}', var)
                if match:
                    has_expansion = True
                    prefix = var[:match.start()]
                    suffix = var[match.end():]
                    options = match.group(1).split('|')
                    
                    for opt in options:
                        # Recursively cleaning up double commas/spaces is good practice but let's keep it simple first
                        new_variations.append(f"{prefix}{opt}{suffix}")
                else:
                    new_variations.append(var)
            
            if not has_expansion:
                break
                
            variations = new_variations
            
        # Clean up formatting (double commas, etc. if they occurred)
        cleaned_variations = []
        for v in variations:
            # Normalize commas
            parts = [p.strip() for p in v.split(',') if p.strip()]
            cleaned_variations.append(", ".join(parts))
            
        return cleaned_variations

def main():
    parser = argparse.ArgumentParser(description="Wildcard Compressor & Expander")
    subparsers = parser.add_subparsers(dest='command', required=True)

    # Command: Compress
    parser_compress = subparsers.add_parser('compress', help='Compress prompts into wildcards')
    parser_compress.add_argument('-i', '--input', required=True, help='Input text file with raw tags')
    parser_compress.add_argument('-o', '--output', required=True, help='Output file for compressed wildcards')
    parser_compress.add_argument('-t', '--threshold', type=float, default=0.3, help='Similarity threshold (0.0-1.0), default 0.3')

    # Command: Expand
    parser_expand = subparsers.add_parser('expand', help='Expand wildcards into raw prompts')
    parser_expand.add_argument('-i', '--input', required=True, help='Input file with wildcards')
    parser_expand.add_argument('-o', '--output', required=True, help='Output file for expanded prompts')

    args = parser.parse_args()
    processor = WildcardProcessor()

    if args.command == 'compress':
        processor.compress(args.input, args.output, args.threshold)
    elif args.command == 'expand':
        processor.expand(args.input, args.output)

if __name__ == "__main__":
    main()
