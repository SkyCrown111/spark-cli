float4 frag(float2 uv : TEXCOORD0) : SV_Target {
  return tex2D(_MainTex, uv);
}
