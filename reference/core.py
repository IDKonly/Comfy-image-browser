from PIL import Image
import json
import networkx as nx
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
import struct

def _calculate_jaccard_similarity(set1, set2):
    """Helper function to calculate the Jaccard similarity between two sets."""
    if not isinstance(set1, set) or not isinstance(set2, set):
        return 0.0
    if not set1 and not set2:
        return 1.0
    if not set1 or not set2:
        return 0.0
    
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    
    return intersection / union if union > 0 else 0.0

def _build_similarity_graph_vectorized(tag_sets: list[set[str]], threshold: float) -> nx.Graph:
    """
    Builds a similarity graph using vectorized operations for O(N^2) speedup.
    """
    if not tag_sets:
        return nx.Graph()
    
    num_sets = len(tag_sets)
    G = nx.Graph()
    G.add_nodes_from(range(num_sets))
    
    if num_sets < 2:
        return G

    try:
        # Use a dummy analyzer to pass raw sets (as lists) to CountVectorizer
        # This creates a document-term matrix where rows are sets and columns are tags
        vectorizer = CountVectorizer(analyzer=lambda x: x, min_df=1)
        X = vectorizer.fit_transform(tag_sets)
        
        # Ensure binary (presence/absence) - though sets imply unique items, safe to enforce
        X.data.fill(1)
        
        # Calculate intersection: I = X * X.T
        # resulting matrix (i, j) is the count of common tags between set i and set j
        intersection = (X @ X.T)
        
        # Calculate union: |A| + |B| - |A ∩ B|
        # sizes is a (N,) array of set sizes
        sizes = np.array(X.sum(axis=1)).flatten()
        
        # We need to broadcast sizes to compute Union for all pairs.
        # However, creating a full dense matrix for Union might be memory intensive for huge N.
        # But since the resulting Similarity matrix is needed anyway, we proceed with dense for now.
        # Optimizing for memory would require chunking, but standard use case fits in RAM.
        
        # Convert intersection to dense for easy broadcasting operations
        intersection_dense = intersection.toarray()
        
        # Union matrix calculation
        # sizes[:, None] adds a dimension -> (N, 1)
        # sizes[None, :] adds a dimension -> (1, N)
        union_dense = sizes[:, None] + sizes[None, :] - intersection_dense
        
        # Calculate Jaccard Similarity: Intersection / Union
        # Avoid division by zero
        with np.errstate(divide='ignore', invalid='ignore'):
            similarity_matrix = intersection_dense / union_dense
            
            # Handle the case where union is 0 (both sets empty) -> similarity 1.0
            # But here we are dealing with non-empty sets usually. 
            # If both are empty, intersection is 0, union is 0. 0/0 -> NaN.
            similarity_matrix[np.isnan(similarity_matrix)] = 0.0
            
            # If both were empty, they are identical. 
            # Check diagonal or specific indices? 
            # In context, if both sets are empty, they are 'similar'.
            # Let's fix 0/0 case specifically if it occurs.
            mask_zero_union = (union_dense == 0)
            similarity_matrix[mask_zero_union] = 1.0

        # Optimization: Only look at the upper triangle to avoid duplicates and self-loops
        # k=1 excludes diagonal
        rows, cols = np.triu_indices_from(similarity_matrix, k=1)
        
        # Filter pairs that meet the threshold
        mask_valid = similarity_matrix[rows, cols] >= threshold
        
        # Add edges
        valid_rows = rows[mask_valid]
        valid_cols = cols[mask_valid]
        
        # Zip and add
        edges = list(zip(valid_rows, valid_cols))
        G.add_edges_from(edges)
        
    except ValueError:
        # Fallback for empty vocabulary or other vectorizer issues
        pass
    except Exception as e:
        print(f"Vectorization failed, falling back to iterative method: {e}")
        # Fallback to original iterative method if memory fails or other issues
        for i in range(num_sets):
            for j in range(i + 1, num_sets):
                if _calculate_jaccard_similarity(tag_sets[i], tag_sets[j]) >= threshold:
                    G.add_edge(i, j)

    return G

def extract_tags_from_file(file_path):
    """
    Extracts tags from a PNG file by reading chunks directly.
    Optimized to avoid full image decoding using PIL.
    """
    try:
        with open(file_path, 'rb') as f:
            # Check PNG signature
            if f.read(8) != b'\x89PNG\r\n\x1a\n':
                return set()

            while True:
                # Read chunk length (4 bytes big-endian)
                length_bytes = f.read(4)
                if len(length_bytes) < 4: break
                length = struct.unpack('>I', length_bytes)[0]

                # Read chunk type (4 bytes)
                chunk_type = f.read(4)
                if len(chunk_type) < 4: break
                
                # We are looking for 'tEXt' or 'iTXt'
                if chunk_type == b'tEXt':
                    data = f.read(length)
                    # tEXt format: keyword + null + text
                    try:
                        keyword, text = data.split(b'\x00', 1)
                        keyword = keyword.decode('latin-1')
                        text = text.decode('latin-1') # tEXt is latin-1
                        
                        if keyword == 'parameters':
                            positive_prompt = text.split('\nNegative prompt:')[0]
                            return {tag.strip() for tag in positive_prompt.split(',') if tag.strip()}
                        
                        # ComfyUI often stores workflow in 'prompt' or 'workflow'
                        # but ComfyUI usually uses tEXt for 'prompt' (JSON)
                        if keyword == 'prompt':
                             prompt_data = json.loads(text)
                             if '3' in prompt_data and 'string' in prompt_data['3']:
                                return {tag.strip() for tag in prompt_data['3']['string'].split(',') if tag.strip()}
                                
                    except Exception:
                        pass
                
                elif chunk_type == b'iTXt':
                     # iTXt format is more complex: 
                     # Keyword (1-79 bytes) + Null + Compression flag (1) + Compression method (1) 
                     # + Language tag (0+ bytes) + Null + Translated keyword (0+ bytes) + Null + Text
                     # For speed, we might just look for the keyword at the start
                     data = f.read(length)
                     try:
                         # Quick and dirty parser for iTXt
                         parts = data.split(b'\x00', 5) # Split into at most 6 parts
                         if len(parts) >= 6:
                             keyword = parts[0].decode('utf-8')
                             text_bytes = parts[-1] 
                             # Note: text might be compressed if flag is 1, but usually parameters are not
                             # We assume uncompressed for 'parameters' usually
                             
                             if keyword == 'parameters':
                                 text = text_bytes.decode('utf-8')
                                 positive_prompt = text.split('\nNegative prompt:')[0]
                                 return {tag.strip() for tag in positive_prompt.split(',') if tag.strip()}
                             
                             # ComfyUI iTXt handling?
                     except Exception:
                         pass

                else:
                    # Skip data and CRC (4 bytes)
                    f.seek(length, 1)
                
                # Skip CRC
                f.seek(4, 1)

                if chunk_type == b'IEND':
                    break

    except Exception as e:
        # print(f"Fast Error: {e}")
        pass
    
    # Fallback to PIL if fast method fails or it's not a PNG (e.g. JPG, WEBP)
    # The original function handled logic for this, but since the requirement is to replace it
    # and improve speed, we should handle non-PNGs too or rely on PIL for them.
    # Given the previous context was strictly replacing, let's include the PIL fallback here
    # to be safe for non-PNG files (JPG/WEBP) which were supported before.
    try:
        with Image.open(file_path) as img:
            metadata = img.info
            if 'parameters' in metadata:
                params = metadata['parameters']
                positive_prompt = params.split('\nNegative prompt:')[0]
                return {tag.strip() for tag in positive_prompt.split(',') if tag.strip()}
            elif 'prompt' in metadata:
                prompt_data = json.loads(metadata['prompt'])
                if '3' in prompt_data and 'string' in prompt_data['3']:
                    return {tag.strip() for tag in prompt_data['3']['string'].split(',') if tag.strip()}
    except Exception:
        pass

    return set()

def get_tags_from_files_parallel(file_paths):
    """Extracts tags from multiple files in parallel."""
    with ProcessPoolExecutor() as executor:
        results = list(executor.map(extract_tags_from_file, file_paths))
    
    # The result from get_tags_from_files was a single set with all tags.
    # To maintain compatibility, we union all the sets from the parallel processing.
    all_tags = set().union(*results)
    return all_tags

def merge_tag_groups(tag_groups: list[set[str]], similarity_threshold: float = 0.9) -> list[str]:
    """
    Merges similar groups of tags using a recursive, graph-based approach into a tree-like format.
    """
    if not tag_groups:
        return []
    
    original_sets = [s for s in tag_groups if isinstance(s, set) and s]
    if not original_sets:
        return []

    # Build the top-level graph to find major clusters using vectorized approach
    G = _build_similarity_graph_vectorized(original_sets, similarity_threshold)

    # Process each cluster recursively and handle singletons
    merged_groups = []
    processed_indices = set()
    for component in nx.connected_components(G):
        processed_indices.update(component)
        component_sets = [original_sets[i] for i in component]
        merged_groups.append(_recursive_part(component_sets, similarity_threshold))

    for i, s in enumerate(original_sets):
        if i not in processed_indices:
            merged_groups.append(", ".join(sorted(list(s))))
            
    return sorted(merged_groups)


def _recursive_part(tag_sets: list[set[str]], threshold: float) -> str:
    """
    Recursively merges a list of tag sets (a cluster) into a single merged string.
    """
    if len(tag_sets) <= 1:
        return ", ".join(sorted(list(tag_sets[0]))) if tag_sets else ""

    # Find common base of the current cluster
    try:
        common_base = set.intersection(*tag_sets)
    except TypeError:
        common_base = set()

    # FIX for recursion error: If the common base of a cluster is empty,
    # we cannot reduce the problem size by splitting it.
    # In this case, we stop recursing and format the cluster as a flat list.
    if not common_base and len(tag_sets) > 1:
        parts = [', '.join(sorted(list(s))) for s in tag_sets]
        return '|'.join(sorted(parts))
    
    base_str = ", ".join(sorted(list(common_base)))

    # Get differences; these will be the basis for the next level of recursion/clustering
    difference_sets = [s - common_base for s in tag_sets]

    if not any(difference_sets):
        return base_str

    # Cluster the differences using vectorized graph build
    # We pass the difference sets directly
    # Note: difference_sets contains empty sets for those that exactly matched the base
    # We should only cluster non-empty ones
    
    non_empty_diffs = [(i, s) for i, s in enumerate(difference_sets) if s]
    
    # Extract just the sets for vectorization
    just_diff_sets = [s for _, s in non_empty_diffs]
    
    G_diff = _build_similarity_graph_vectorized(just_diff_sets, threshold)
    
    # Map back the graph indices (0..k) to original indices in difference_sets
    # G_diff nodes are 0..len(just_diff_sets)-1
    
    # Process sub-clusters recursively
    diff_parts = []
    processed_diff_indices_local = set() # indices in just_diff_sets
    
    for diff_component in nx.connected_components(G_diff):
        processed_diff_indices_local.update(diff_component)
        # diff_component contains indices into just_diff_sets
        component_diff_sets = [just_diff_sets[i] for i in diff_component]
        diff_parts.append(_recursive_part(component_diff_sets, threshold))

    # Handle singleton differences (those not in any cluster within differences)
    for i, s in enumerate(just_diff_sets):
        if i not in processed_diff_indices_local:
            diff_parts.append(", ".join(sorted(list(s))))

    # Account for the empty difference set if it exists (meaning some sets were equal to base)
    if any(not s for s in difference_sets):
        diff_parts.append("")

    # Assemble the final string for this level
    diff_parts.sort(key=lambda x: (x == "", x))
    
    if base_str:
        processed_diffs = [f", {d}" if d else "" for d in diff_parts]
    else:
        processed_diffs = diff_parts
        
    diff_str = "|".join(processed_diffs)
    
    return f"{base_str}{{{diff_str}}}"


def get_tags_from_files(file_paths):
    """Original sequential version for compatibility if needed."""
    all_tags = set()
    for file_path in file_paths:
        all_tags.update(extract_tags_from_file(file_path))
    return all_tags

def compare_tags(target_files, comparison_files):
    target_tags = get_tags_from_files(target_files)
    comparison_tags = get_tags_from_files(comparison_files)
    unique_tags = target_tags - comparison_tags
    return unique_tags